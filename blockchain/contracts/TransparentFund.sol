// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title  TransparentFund
 * @notice Locks donor ETH per campaign and releases it to NGO wallets
 *         only when the owner (platform) approves a milestone.
 *
 * CHANGES vs original (minimal — same behaviour):
 *   1. transfer() replaced with call() — avoids 2300-gas revert on contract wallets
 *   2. Explicit address(this).balance guard before transfer
 *   3. receive() added so contract can accept plain ETH sends
 *   4. releaseMilestone emits amount in wei (unchanged) — added natspec comments
 */
contract TransparentFund {

    /* ─── data structures ──────────────────────────────── */

    struct Campaign {
        string  campaignId;
        uint256 totalLocked;    // ETH currently held for this campaign (wei)
        uint256 totalReleased;  // ETH already sent to NGO wallets (wei)
    }

    /* ─── state ─────────────────────────────────────────── */

    mapping(string => Campaign) public campaigns;
    address public owner;

    /* ─── events ─────────────────────────────────────────── */

    event DonationLocked(
        string indexed campaignId,
        address indexed donor,
        uint256 amount
    );
    event MilestoneReleased(
        string indexed campaignId,
        address indexed ngoWallet,
        uint256 amount
    );

    /* ─── modifiers ──────────────────────────────────────── */

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    /* ─── constructor ────────────────────────────────────── */

    constructor() {
        owner = msg.sender;
    }

    /* ─── receive plain ETH (e.g. MetaMask direct send) ──── */

    // FIX 3: allows contract to accept plain ETH without data
    receive() external payable {}

    /* ─── donor function ─────────────────────────────────── */

    /**
     * @notice Lock ETH for a campaign. Call with msg.value > 0.
     * @param  _campaignId  Firestore campaign document ID (string)
     */
    function donate(string memory _campaignId) public payable {
        require(msg.value > 0, "Donation must be greater than zero");

        Campaign storage campaign = campaigns[_campaignId];

        // Auto-create campaign record on first donation
        if (bytes(campaign.campaignId).length == 0) {
            campaign.campaignId = _campaignId;
        }

        campaign.totalLocked += msg.value;

        emit DonationLocked(_campaignId, msg.sender, msg.value);
    }

    /* ─── owner function (milestone approval) ────────────── */

    /**
     * @notice Release locked ETH to an NGO wallet after milestone approval.
     *         Only the platform owner can call this.
     * @param  _campaignId  Campaign to release from
     * @param  _ngoWallet   NGO's receiving wallet address
     * @param  _amount      Amount in wei to release
     */
    function releaseMilestone(
        string memory _campaignId,
        address payable _ngoWallet,
        uint256 _amount
    ) public onlyOwner {
        Campaign storage campaign = campaigns[_campaignId];

        require(bytes(campaign.campaignId).length > 0, "Campaign does not exist");
        require(campaign.totalLocked >= _amount, "Insufficient locked funds");

        // FIX 2: also guard against actual contract balance (defensive check)
        require(address(this).balance >= _amount, "Contract balance too low");

        // State updated BEFORE transfer (correct order — prevents reentrancy)
        campaign.totalLocked  -= _amount;
        campaign.totalReleased += _amount;

        // FIX 1: use call() instead of transfer() — no 2300-gas limit
        (bool sent, ) = _ngoWallet.call{value: _amount}("");
        require(sent, "ETH transfer to NGO wallet failed");

        emit MilestoneReleased(_campaignId, _ngoWallet, _amount);
    }

    /* ─── view functions ─────────────────────────────────── */

    /**
     * @notice Get campaign stats. Free to call (no gas).
     * @return campaignId    The stored campaign ID string
     * @return totalLocked   ETH still locked (wei)
     * @return totalReleased ETH already released to NGO (wei)
     */
    function getCampaign(string memory _campaignId)
        public
        view
        returns (string memory, uint256, uint256)
    {
        Campaign memory campaign = campaigns[_campaignId];
        return (campaign.campaignId, campaign.totalLocked, campaign.totalReleased);
    }

    /**
     * @notice Total ETH held in this contract across all campaigns.
     */
    function contractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
