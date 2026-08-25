// Shared data for Military Things To Do — Naval Station Norfolk
// Loaded by norfolk.html (listings) and listing.html (detail pages, ?base=norfolk)
//
// NOTE: this base is a work in progress. Started with a first researched batch
// of restaurants; more categories to follow. Coordinates for this first batch
// were estimated from known downtown Norfolk / Ghent neighborhood landmarks
// rather than a precise per-address geocode — reasonably accurate for
// distance sorting, but worth spot-checking against a mapping tool over time.

const places = [
  // Restaurants & Cafés
  { id:"saltine-norfolk", name:"Saltine", cat:"restaurant", dist:11.22, lat:36.847, lng:-76.291, addr:"100 E Main St, Norfolk", blurb:"An elevated seafood restaurant in the historic Decker building downtown — oysters, a curated raw bar, and a genuinely refined atmosphere for a nicer night out.", hours:"Mon–Thu,Sun 11:30–23:00 · Fri/Sat 11:30–24:00", phone:"+1 757-763-6280", rating:4.5, reviewCount:927 },
  { id:"no-frill-bar-and-grill", name:"No Frill Bar and Grill", cat:"restaurant", dist:7.86, lat:36.877, lng:-76.296, addr:"806 Spotswood Ave, Norfolk", blurb:"A Ghent neighborhood institution for over 20 years — comfort food classics like meatloaf and Sunday brunch, in a colorful, casual setting with a loyal following.", hours:"Mon,Sun 11–20 · Tue–Sat 11–21", phone:"+1 757-627-4262", rating:4.6, reviewCount:1135 },
  { id:"fair-grounds-coffee", name:"Fair Grounds Coffee Cafe", cat:"restaurant", dist:7.87, lat:36.877, lng:-76.295, addr:"806 Baldwin Ave #2, Norfolk", blurb:"Norfolk's oldest independent coffee shop, tucked into a quirky two-story house in Ghent — great espresso, in-house sandwiches, and a genuinely cozy place to sit a while.", hours:"Mon–Thu,Sun 7–20 · Fri/Sat 7–21", phone:"+1 757-640-2899", rating:4.6, reviewCount:369 },
  { id:"redwood-smoke-shack-norfolk", name:"Redwood Smoke Shack", cat:"restaurant", dist:8.01, lat:36.876, lng:-76.293, addr:"2001 Manteo St, Norfolk", blurb:"Texas-style BBQ smoked low and slow over oak, hickory, and pecan — genuinely great brisket, and one of the only spots in Hampton Roads pouring Texas' own Big Red soda.", hours:"Tue–Sat 11–20 · Closed Sun/Mon", phone:"+1 757-624-1000", rating:4.7, reviewCount:433 },
];

const catLabels = { restaurant:"Restaurant", grocery:"Grocery", attraction:"Attraction", auto:"Auto", health:"Health", banking:"Banking", housing:"Housing", pets:"Pet Services", fitness:"Fitness", religious:"Religious", shopping:"Shopping", storage:"Storage", museum:"Museum", outdoors:"Outdoors", kids:"Kids", farmers:"Farmers Market", phone:"Phone/Internet", cars:"Car Dealer", tailor:"Tailoring", furniture:"Furniture", legal:"Legal", education:"Education", schools:"Schools", community:"Community", bars:"Bar", services:"Base Services", rec:"Recreation", tattoo:"Tattoo Shop", notary:"Notary/Shipping", beaches:"Beaches", historic:"Historic Triangle Day Trips" };
