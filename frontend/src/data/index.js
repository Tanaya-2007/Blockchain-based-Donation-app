export const campaigns = [
  { id:1, title:"Ravi Kumar — Kidney Surgery",     desc:"42-year-old daily wage worker needs urgent bilateral kidney surgery. Family has no savings.",                                 cat:"medical",  emoji:"🏥", goal:300000, raised:187500, milestone:"Milestone 2 of 4", verified:true },
  { id:2, title:"Priya NGO — Rural School",        desc:"Building 3 classrooms for 200+ children in Marathwada drought-affected village.",                                           cat:"ngo",      emoji:"🏫", goal:500000, raised:312000, milestone:"Milestone 3 of 5", verified:true },
  { id:3, title:"Ananya — Bone Marrow Transplant", desc:"7-year-old girl with acute leukemia. Bone marrow match found. Treatment starts next month.",                                cat:"medical",  emoji:"👧", goal:800000, raised:540000, milestone:"Milestone 4 of 6", verified:true },
  { id:4, title:"Flood Relief — Sangli District",  desc:"700 families displaced by floods. Immediate need for food, shelter and medicine.",                                         cat:"disaster", emoji:"🌊", goal:1000000,raised:430000, milestone:"Milestone 1 of 3", verified:true },
  { id:5, title:"Rohit — MBBS Scholarship",        desc:"First-generation college student from tribal community secured MBBS seat. Needs fee support.",                             cat:"education",emoji:"📚", goal:400000, raised:220000, milestone:"Milestone 2 of 4", verified:true },
  { id:6, title:"Village Water Project — Osmanabad",desc:"Clean drinking water pipeline for 3 villages. 1,200 families currently using contaminated sources.",                     cat:"ngo",      emoji:"💧", goal:600000, raised:290000, milestone:"Milestone 2 of 4", verified:true },
];

export const txData = [
  { camp:"Ravi Kumar",    type:"release",  amt:"₹75,000",   ms:"Milestone 1",  status:"v",  hash:"0x7f4e...2e4f" },
  { camp:"Priya NGO",     type:"donation", amt:"₹5,000",    ms:"—",            status:"v",  hash:"0x3a2b...9c1d" },
  { camp:"Ananya",        type:"release",  amt:"₹1,20,000", ms:"Milestone 3",  status:"v",  hash:"0x9b8a...4f2e" },
  { camp:"Flood Relief",  type:"donation", amt:"₹2,500",    ms:"—",            status:"v",  hash:"0x1c2d...7a3b" },
  { camp:"Rohit",         type:"release",  amt:"₹80,000",   ms:"Milestone 1",  status:"v",  hash:"0x5e6f...2c1a" },
  { camp:"Water Project", type:"proof",    amt:"—",          ms:"Milestone 2",  status:"p",  hash:"0x8d9e...5b4c" },
];

export const ledgerData = [
  { block:"#294,847", type:"donation", details:"0x7f4e...2e4f → Smart Contract", amt:"₹5,000",   time:"2 min ago"  },
  { block:"#294,831", type:"release",  details:"Smart Contract → 0x3a2b...9c1d",  amt:"₹75,000",  time:"18 min ago" },
  { block:"#294,819", type:"proof",    details:"IPFS Hash: QmX7y8...a4b2",        amt:"—",         time:"34 min ago" },
  { block:"#294,802", type:"donation", details:"0x9b8a...4f2e → Smart Contract",  amt:"₹2,500",   time:"1 hr ago"   },
  { block:"#294,788", type:"release",  details:"Smart Contract → 0x1c2d...7a3b",  amt:"₹1,20,000",time:"2 hrs ago"  },
  { block:"#294,771", type:"proof",    details:"IPFS Hash: QmA3x4...c9d8",        amt:"—",         time:"3 hrs ago"  },
  { block:"#294,750", type:"donation", details:"0x5e6f...2c1a → Smart Contract",  amt:"₹10,000",  time:"4 hrs ago"  },
];

export const barData = [
  { l:"Ravi K.", c:80,r:50,k:30 }, { l:"Priya NGO",c:62,r:40,k:22 },
  { l:"Ananya",  c:90,r:70,k:20 }, { l:"Flood",    c:43,r:20,k:23 },
  { l:"Rohit",   c:55,r:35,k:20 }, { l:"Water",    c:48,r:25,k:23 },
  { l:"New",     c:20,r:0, k:20 },
];