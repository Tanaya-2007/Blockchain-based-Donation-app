// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TransparentFund {
    struct Campaign {
        string campaignId;
        uint256 totalLocked;    // USDC amount locked (6 decimals)
        uint256 totalReleased;  // USDC amount released (6 decimals)
        bool exists;
    }

    address public owner;
    IERC20 public usdcToken;
    mapping(string => Campaign) public campaigns;

    event DonationLocked(string indexed campaignId, address indexed donor, uint256 amount);
    event MilestoneReleased(string indexed campaignId, address indexed ngoWallet, uint256 amount);
    event CampaignRefunded(string indexed campaignId, address indexed donor, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
    }

    function donate(string memory _campaignId, uint256 _amount) public {
        require(_amount > 0, "Amount must be greater than zero");
        
        Campaign storage campaign = campaigns[_campaignId];
        if (!campaign.exists) {
            campaign.campaignId = _campaignId;
            campaign.exists = true;
        }

        // Pull USDC from donor/treasury to contract
        require(usdcToken.transferFrom(msg.sender, address(this), _amount), "USDC transfer failed");
        
        campaign.totalLocked += _amount;
        emit DonationLocked(_campaignId, msg.sender, _amount);
    }

    function releaseMilestone(
        string memory _campaignId,
        address _ngoWallet,
        uint256 _amount
    ) public onlyOwner {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.exists, "Campaign does not exist");
        require(campaign.totalLocked >= _amount, "Insufficient locked funds");

        campaign.totalLocked -= _amount;
        campaign.totalReleased += _amount;

        // Transfer USDC to NGO
        require(usdcToken.transfer(_ngoWallet, _amount), "USDC transfer to NGO failed");

        emit MilestoneReleased(_campaignId, _ngoWallet, _amount);
    }

    // Distributes refunds to donors on-chain
    function refundCampaign(
        string memory _campaignId,
        address[] memory _donors,
        uint256[] memory _amounts
    ) public onlyOwner {
        Campaign storage campaign = campaigns[_campaignId];
        require(campaign.exists, "Campaign does not exist");
        require(_donors.length == _amounts.length, "Array length mismatch");

        uint256 totalRefund;
        for (uint256 i = 0; i < _donors.length; i++) {
            address donor = _donors[i];
            uint256 amount = _amounts[i];
            if (donor != address(0) && amount > 0) {
                totalRefund += amount;
                require(usdcToken.transfer(donor, amount), "USDC refund transfer failed");
                emit CampaignRefunded(_campaignId, donor, amount);
            }
        }

        require(campaign.totalLocked >= totalRefund, "Refund amount exceeds locked balance");
        campaign.totalLocked -= totalRefund;
    }

    function getCampaign(string memory _campaignId)
        public
        view
        returns (string memory, uint256, uint256)
    {
        Campaign memory campaign = campaigns[_campaignId];
        return (campaign.campaignId, campaign.totalLocked, campaign.totalReleased);
    }

    function contractBalance() public view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}
