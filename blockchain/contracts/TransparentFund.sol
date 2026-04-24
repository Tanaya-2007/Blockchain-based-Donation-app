// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TransparentFund {
    struct Campaign {
        string campaignId;
        uint256 totalLocked;
        uint256 totalReleased;
    }

    mapping(string => Campaign) public campaigns;
    address public owner;

    event DonationLocked(string campaignId, address indexed donor, uint256 amount);
    event MilestoneReleased(string campaignId, address indexed ngoWallet, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function donate(string memory _campaignId) public payable {
        require(msg.value > 0, "Donation must be greater than zero");
        
        Campaign storage campaign = campaigns[_campaignId];
        
        // If it's a new campaign, set the ID
        if (bytes(campaign.campaignId).length == 0) {
            campaign.campaignId = _campaignId;
        }

        campaign.totalLocked += msg.value;

        emit DonationLocked(_campaignId, msg.sender, msg.value);
    }

    function releaseMilestone(string memory _campaignId, address payable _ngoWallet, uint256 _amount) public onlyOwner {
        Campaign storage campaign = campaigns[_campaignId];
        
        require(bytes(campaign.campaignId).length > 0, "Campaign does not exist");
        require(campaign.totalLocked >= _amount, "Insufficient locked funds");

        campaign.totalLocked -= _amount;
        campaign.totalReleased += _amount;

        _ngoWallet.transfer(_amount);

        emit MilestoneReleased(_campaignId, _ngoWallet, _amount);
    }

    function getCampaign(string memory _campaignId) public view returns (string memory, uint256, uint256) {
        Campaign memory campaign = campaigns[_campaignId];
        return (campaign.campaignId, campaign.totalLocked, campaign.totalReleased);
    }
}
