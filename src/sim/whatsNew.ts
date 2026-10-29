/**
 * The update log behind the title screen's What's new. Each save keeps `news`,
 * the id of the latest update its player has been shown, and the dialog lists
 * the ones after it.
 *
 * Add one update per shipped sub-phase that changes play, in the same change,
 * with the next id. Sub-phases of one phase share a `phase` so they show under
 * one heading. Never edit the text of an update that has shipped: a save that
 * has seen it won't be shown it again.
 */
export interface Update {
  /** Counts up from 1. */
  id: number
  /** The phase it shipped in, shown as "Phase <phase>". */
  phase: string
  title: string
  /** Short, player-facing lines: what you can do, not how it's built. */
  items: string[]
}

export const UPDATES: readonly Update[] = [
  {
    id: 1,
    phase: '4',
    title: 'Play on phones and tablets',
    items: [
      'Tap to walk and act. Pinch to zoom, and twist two fingers to turn the view.',
      'Every key now has an on-screen button, and the screen fits phones.',
      'Turn your phone sideways to play. The game pauses in portrait.',
    ],
  },
  {
    id: 2,
    phase: '5',
    title: 'Profit and ordering stock',
    items: [
      'Every car has a dealer cost, and the day summary shows your gross profit.',
      'Order new cars from the office computer (or press I). They arrive the next morning.',
      'Pay cash, or floor a car with the bank and pay daily interest until it sells.',
      'Salespeople earn a commission on each sale.',
    ],
  },
  {
    id: 3,
    phase: '6',
    title: 'Haggling',
    items: [
      'Name your price. Customers accept, counter or walk away.',
      'Each kind of customer haggles differently, and some won’t budge much.',
      'Your salespeople haggle too, and do it better the more skilled they are.',
    ],
  },
  {
    id: 4,
    phase: '7',
    title: 'Marketing, upgrades and reputation',
    items: [
      'Run newspaper, radio, TV and online ads from the computer’s Marketing tab (M).',
      'Buy upgrades (U), from a bigger sign and a tube man to a coffee bar and a waiting room TV.',
      'Reputation rises with sales and falls with unhappy customers. A good one brings referrals.',
    ],
  },
  {
    id: 5,
    phase: '8',
    title: 'Sound and music',
    items: [
      'Sound effects, music that follows the day, and chattering voices.',
      'Set the volume from the speaker on the top bar. N mutes.',
    ],
  },
  {
    id: 6,
    phase: '9',
    title: 'Nazma',
    items: [
      'Nazma turns up to smudge your cars. Chase him off before he finishes.',
      'Hire a security guard to keep him away.',
      'Watch out for cars stolen overnight, and for Nazma poaching your staff. A raise can keep them.',
    ],
  },
  {
    id: 7,
    phase: '10',
    title: 'Calendar, weather and events',
    items: [
      'A calendar with busier weekends. Check it on the computer’s Calendar tab (C).',
      'Weather: rain keeps people away and dirties the lot.',
      'People waiting outside lose patience faster on hot or rainy days.',
      'A monthly sales target from the manufacturer pays a bonus when you hit it.',
      'Weekend sales events, and month-end closeouts on one model.',
    ],
  },
  {
    id: 8,
    phase: '11',
    title: 'Difficulty levels',
    items: [
      'Pick Easy, Medium or Hard when you start a new game. Older games carry on at Medium.',
      'Easy adds a deal hint while you haggle, a one-time bank safety net and tips.',
    ],
  },
  {
    id: 9,
    phase: '12',
    title: 'Used cars',
    items: [
      'Some customers drive in and park out front.',
      'Sellers want cash for their car. Look it over to appraise it, then make an offer.',
      'Take a trade-in as part of a sale.',
      'Used-car shoppers come by. Used stock loses value the longer it sits.',
      'Classifieds ads bring more sellers and drive-ins.',
    ],
  },
  {
    id: 10,
    phase: '13',
    title: 'Dealer ranks',
    items: [
      'Earn dealer ranks from your lifetime gross profit and reputation. A rank, once earned, is kept.',
      'The top bar shows your rank and how far you are from the next one. The day summary tells you when you rank up.',
    ],
  },
  {
    id: 11,
    phase: '13',
    title: 'Franchise tiers',
    items: [
      'The manufacturer ranks you Bronze, Silver or Gold. Meet the quota to move up a tier; fall well short to drop one.',
      'Silver and Gold dealers pay less for stock and earn a bigger holdback.',
      'The Summit Vela GT now needs Silver and the Summit Ridge Platinum Gold. Locked models are greyed out on the Stock tab.',
      'The Calendar tab shows your tier and what it takes to move.',
    ],
  },
  {
    id: 12,
    phase: '13',
    title: 'The east lot',
    items: [
      'From Main Street, buy the parcel next door on the Upgrades tab. It’s built overnight with 12 more parking spaces.',
      'Stock goes there once the old lot is full, and your security guard adds it to their rounds.',
    ],
  },
  {
    id: 13,
    phase: '13',
    title: 'The showroom wing',
    items: [
      'From Regional Name, with the east lot bought, build a showroom wing next to the lounge on the Upgrades tab.',
      'It adds 2 display platforms, sales desks 3 and 4 and a second sofa for buyers waiting on finance.',
      'With the wing up you can hire up to 4 salespeople and 2 lot porters. Porters split the washing between them.',
    ],
  },
  {
    id: 14,
    phase: '13',
    title: 'Dealer of the Year',
    items: [
      'Reach the top rank, Dealer of the Year, to win: a trophy screen sums up your career.',
      'Keep playing afterwards as long as you like. A save that has won shows a trophy on the title screen.',
    ],
  },
  {
    id: 15,
    phase: '14',
    title: 'A rival across the road',
    items: [
      'Reach Main Street and Nazma buys the lot across the road. You get a week’s notice before his dealership opens.',
      'Once it’s open, some shoppers go to him instead. A good reputation, running ads and fair prices win them back.',
    ],
  },
  {
    id: 16,
    phase: '14',
    title: 'Keeping an eye on Nazma',
    items: [
      'His lot goes up across the road, in view from the sidewalk: a building site, then his showroom, stock and price banner.',
      'The new Rival tab on the office computer (K) shows his share of buyers day by day, his strength and his prices.',
      'The top bar shows his share of today’s buyers, and each Monday morning you hear how he did last week.',
    ],
  },
  {
    id: 17,
    phase: '14',
    title: 'Shoppers with his price',
    items: [
      'Some shoppers have been to Nazma’s lot first, and the customer panel shows the price he quoted them.',
      'Ask well over his price and they may walk out to him. Match his price for a likelier yes.',
      'Your salespeople match him too, as long as the sale still pays.',
    ],
  },
  {
    id: 18,
    phase: '14',
    title: 'Nazma’s weekly moves',
    items: [
      'Each Monday Nazma picks a move: a price war, an ad blitz against yours, a sale weekend or a quiet week.',
      'The worse his lot does, the more desperate he gets, and the more often he comes over to cause trouble.',
      'Cars he steals go up for sale on his lot, and staff he poaches go to work for him.',
    ],
  },
  {
    id: 19,
    phase: '14',
    title: 'Driving Nazma out of business',
    items: [
      'Keep Nazma’s share of buyers low for three weeks running and his lot goes bust.',
      'Beating him lifts your reputation, sends his buyers to you for a week and keeps him away for a while.',
      'He comes back a few weeks later under a new name, a little stronger. The Rival tab counts the rivals you’ve beaten.',
    ],
  },
  {
    id: 20,
    phase: '15',
    title: 'The service garage',
    items: [
      'From Trusted Dealer, with the east lot bought, build a 2-bay service garage on the Upgrades tab.',
      'Hire a mechanic per bay. They recondition worn used cars, which go back on sale in better shape and for more.',
      'Pick Recondition on a used car, or use the new Service tab on the office computer (B).',
      'The Service tab can also send the used cars you take in to the shop on its own.',
    ],
  },
  {
    id: 21,
    phase: '15',
    title: 'Service clients',
    items: [
      'With a garage built, people drive in for oil changes, tires, brakes and repairs, through a new east gate.',
      'Check them in at the garage counter to quote the job, or hire a service advisor. They pay on collecting.',
      'Short jobs: they sit and wait. Long ones: they leave the car and come back at the time promised.',
      'Happy clients raise your reputation; a late car or a client turned away lowers it.',
    ],
  },
  {
    id: 22,
    phase: '15',
    title: 'Extra work, the shop rate and comebacks',
    items: [
      'Mechanics sometimes find more work. Pick Recommend work on the client, or Call from the Service tab.',
      'A service advisor offers the extra work too.',
      'Set the shop rate on the Service tab: Budget brings more clients, Premium earns more from fewer.',
      'A job that doesn’t hold brings the client back for a free redo and costs reputation.',
      'The owner may now ask for a number of service jobs finished.',
    ],
  },
  {
    id: 23,
    phase: '15',
    title: 'Manufacturer recalls',
    items: [
      'Some months the manufacturer recalls a model, from the 8th to the 28th.',
      'The people you sold one to bring it to your garage. The manufacturer pays for the work.',
      'The Calendar and Service tabs show the recall on now.',
      'Service clients come in more often, and the service garage costs less to build.',
    ],
  },
  {
    id: 24,
    phase: '16',
    title: 'Your client book',
    items: [
      'Everyone who buys now goes in your client book, and so does a shopper you talked to who left without buying.',
      'Each visit is scored on the wait, the haggling, the price, how clean the car was and the trade-in.',
      'The new Clients tab on the office computer (L) lists them, how happy they are and why.',
      'Someone from the book who comes back has a star over them, and their panel says how it went last time.',
      'The office computer now has one Office action, which opens on the tab you used last.',
    ],
  },
  {
    id: 25,
    phase: '16',
    title: 'Calls and appointments',
    items: [
      'There’s a phone on the office desk. Call clients from it, or with Call in the Clients tab.',
      'Thank new buyers, call prospects back and check on unhappy clients.',
      'A call can book an appointment for tomorrow. The morning notice and the Calendar tab list them.',
      'A prospect who comes back is ready to deal. Don’t keep an appointment waiting.',
      'A receptionist calls clients when nobody is waiting. Turn it off in the Clients tab.',
    ],
  },
  {
    id: 26,
    phase: '16',
    title: 'Trade-ups and the loyalty discount',
    items: [
      'A month or two after buying, a client is due to trade up. The happier they are, the likelier they come back.',
      'They drive in with the car you sold them to trade, and shop the same model or the next size up.',
      'Call a due client to invite them in. Not back within three weeks, they buy elsewhere.',
      'Happy clients are keener to buy and haggle less.',
      'Set a loyalty discount in the Clients tab: returning clients pay less but come back more often.',
    ],
  },
  {
    id: 27,
    phase: '16',
    title: 'Referrals and client appreciation day',
    items: [
      'Happy clients send friends in by name for a few weeks after buying. Their panel says who sent them.',
      'Referrals now come only from your clients: a good reputation and a thank-you call make them send more.',
      'Set a referral fee in the Clients tab, paid when a friend buys, to get more of them.',
      'Book a client appreciation day in the Calendar tab: a cookout on the lot that brings your clients back.',
    ],
  },
  {
    id: 28,
    phase: '16',
    title: 'Customer satisfaction, service clients and Nazma',
    items: [
      'The manufacturer surveys new-car buyers each month (CSI). A low score cuts the holdback and blocks a tier-up.',
      'Your clients bring the cars you sold them in for service, by name. Fewer strangers come from town.',
      'Pitch a trade-up to a client waiting in the garage who is due soon, and they come back tomorrow to trade.',
      'While Nazma’s lot is open, clients who drift away may buy there. Call them to win them back.',
      'The owner may ask you to sell to returning clients.',
    ],
  },
  {
    id: 29,
    phase: '17',
    title: 'Stats and records',
    items: [
      'The office computer has a Stats tab (P): lifetime totals, close rate and gross per sale.',
      'Your records: best day, week and month, biggest deal and longest selling streak.',
      'Charts of sales, gross, net, visitors, reputation and cash, over the last 28 days or the whole game.',
      'Lifetime sales by model, by what brought buyers in and by who sold them.',
      'The day summary says when you break a record.',
    ],
  },
  {
    id: 30,
    phase: '17',
    title: 'Achievements',
    items: [
      'Earn achievements for small wins: a car sold at full sticker, Nazma run off the lot, the quota met and more.',
      'Each one pops up with a chime as you earn it; those the end of a day earns are listed in the day summary.',
      'They’re a record only, and count the same on every level. Each game keeps its own.',
    ],
  },
  {
    id: 31,
    phase: '17',
    title: 'Achievements view and trophy case',
    items: [
      'The Stats tab has an Achievements view: each one by group, with the day you earned it and a medal for the level.',
      'Trophies on the title screen keeps every achievement earned on this device, at the hardest level, and your best records.',
      'Starting a new game keeps the trophy case. Reset trophies at the bottom of it empties it.',
    ],
  },
  {
    id: 32,
    phase: '18',
    title: 'Smoother play and a Graphics setting',
    items: [
      'The game draws far less each frame, loads faster, and no longer piles up memory as you point at things.',
      'Graphics in the 🔊 panel: Auto lowers the detail when the game stutters and raises it again when it runs smoothly.',
      'If the browser refuses the end-of-day save, the game now tells you.',
    ],
  },
  {
    id: 33,
    phase: '19',
    title: 'Your desk and the F&I menu',
    items: [
      'You have your own desk on the showroom floor, by the office door. Close deals there, or at the office desk.',
      'Greeting a buyer tells you whether they pay cash or finance, their credit tier and what they put down.',
      'After the paperwork comes the F&I menu: pick a lender and a markup, then present warranties and other cover.',
      'Every product you push makes the next yes less likely. A buyer no lender takes may put more down, or walk.',
      'The day summary shows your F&I gross, and it counts toward ranks and the owner’s goals.',
    ],
  },
  {
    id: 34,
    phase: '19',
    title: 'Name your dealership',
    items: [
      'Starting a new game asks for your dealership’s name, and it goes up on the sign out front.',
      'The title screen, the day summary and the Dealer of the Year screen show it too. Games from before keep the old name.',
    ],
  },
  {
    id: 35,
    phase: '19',
    title: 'Porters wash the morning dust',
    items: [
      'Lot porters now wash a car after one night’s dust on the lot, instead of standing idle.',
      'A lot they’d kept clean used to be just clean enough each morning for them to skip it.',
    ],
  },
  {
    id: 36,
    phase: '19',
    title: 'The finance manager runs the menu',
    items: [
      'Hand a buyer off to your finance manager and they run the F&I menu: the more skilled, the more they make.',
      'They earn a fee plus a share of each deal’s F&I, and they ask a buyer no lender takes for more down.',
      'Salespeople at their own desks set up loans at the lender’s rate but sell no products.',
      'New Finance tab on the office computer (F): today’s and this month’s F&I, product sales and the lenders.',
      'The day summary’s seller table has an F&I column, and the finance manager gets a row of their own.',
    ],
  },
  {
    id: 37,
    phase: '19',
    title: 'Warranty work and chargebacks',
    items: [
      'Each extended warranty you sell is a contract: covered cars come to your garage for repairs the warranty pays for.',
      'Clients with one of our warranties say yes to extra work more often.',
      'Products sold under pressure, with a big markup or on weak credit can come back weeks later as chargebacks.',
      'On a deal the finance manager signed, their share of a chargeback comes out of their commissions.',
      'The Finance tab counts the contracts in force and the chargebacks still to come.',
    ],
  },
  {
    id: 38,
    phase: '19',
    title: 'Fair finance keeps buyers happy',
    items: [
      'The F&I menu now counts toward a buyer’s visit score, and so toward your CSI.',
      'A fair menu adds a little; a big markup, or product after product turned down, takes points off.',
      'A client whose product is charged back soon after they buy comes in sour on their next visit.',
      'Cash buyers take products less often than buyers who finance, and warranties sell a little better.',
      'A finance manager now pitches better than you from the start, and a skilled one better still.',
      'On Easy, warmth chips show on the markup and on every product.',
      'New tips explain the menu, declined credit, chargebacks and when to hire a finance manager.',
    ],
  },
  {
    id: 39,
    phase: '19',
    title: 'Finance achievements',
    items: [
      'New Finance achievements: your first financed deal at your own desk, every product in one deal, and a big back end.',
      'Also a month of financed deals with no chargebacks, and a warranty repair finished in your garage.',
    ],
  },
  {
    id: 40,
    phase: '20',
    title: 'Test drives',
    items: [
      'Some shoppers ask to drive the car first: look for a key over their head.',
      'While you’re talking, Test drive takes them out in the car, with you riding along.',
      'A showroom car stays on its platform, so they drive one of its model from the lot.',
      'A drive makes them keener to buy, and they hope for less off.',
      'Head back (✕ or Esc) brings you back early, for less of a lift.',
      'You’re off the floor while you’re out, and the car can’t be sold until it’s back.',
      'A shopper who wanted a drive and got a price instead is a little less keen.',
      'The day summary counts the day’s test drives and how many of them bought.',
    ],
  },
  {
    id: 41,
    phase: '20',
    title: 'Talking points',
    items: [
      'Twice on each test drive you get 3 things to point out about the car: tap one, or press 1–3.',
      'Pick what the buyer cares about and the car is good at, and the drive goes down better.',
      'A couple wants safety and room, a bargain hunter economy; a truck is roomy and strong, a sports car handles.',
      'How they took it shows under the drive bar. A prompt you leave counts as so-so.',
      'On Easy, the best topic is marked.',
    ],
  },
  {
    id: 42,
    phase: '20',
    title: 'Salespeople take test drives',
    items: [
      'Salespeople now take a shopper who asked for a drive out themselves, before talking price.',
      'They pick the talking points, the right one more often the more skilled they are.',
      'Talking to a shopper with a key? Send with … hands them to your best free salesperson.',
      'Drives bring cars back muddier (more in the rain), and used cars with a few more miles.',
      'Now and then a car comes back with a ding, which puts buyers off. Fix dent sends it to the garage.',
      'The day summary counts drives taken by salespeople, and any dings.',
    ],
  },
  {
    id: 43,
    phase: '20',
    title: 'Test drives tuned',
    items: [
      'A great test drive now does more: buyers hope for less off and haggle less.',
      'A shopper who asked to drive the car and got a price instead is noticeably cooler.',
      'Visit scores note a test drive the buyer loved, and one they asked for and never had.',
      'New tips on Easy for test drives, dinged cars and handing drives to salespeople.',
    ],
  },
  {
    id: 44,
    phase: '20',
    title: 'Test drive achievements',
    items: [
      'Six achievements for test drives, in a new Test drives group of the Achievements list.',
      'Ride along, make every talking point count, sell to five drivers in a day, and more.',
      'One of them is hidden.',
    ],
  },
  {
    id: 45,
    phase: '21',
    title: 'Staff who grow',
    items: [
      'Your staff earn experience from every day they come in and every bit of work they do.',
      'Enough of it raises their skill a star, about every three to four weeks of steady work.',
      'Each hire can only grow so far: hollow stars after their skill show how far, applicants included.',
      'A level-up comes with a request for a raise. Grant or decline it in the staff panel.',
    ],
  },
  {
    id: 46,
    phase: '21',
    title: 'Staff morale',
    items: [
      'Every employee has a morale, a face in the staff panel. Hover it, or click them, to see why it moved.',
      'Fair pay, sales, finished jobs and running Nazma off lift it.',
      'Pay under their skill, a turned-down raise, walk-outs, comebacks and coworkers leaving lower it.',
      'Happy staff work and learn a little faster. Unhappy ones slow down, and Nazma finds them easier to poach.',
      'Leave someone unhappy for days and they warn you (😟), then hand in notice. Keep them with a raise.',
      'Nobody quits over morale on Easy.',
    ],
  },
  {
    id: 47,
    phase: '21',
    title: 'Days off',
    items: [
      'Every employee has a day off a week, picked to keep each role covered and Friday and Saturday full.',
      'Days off aren’t paid, and the morning notice says who’s off.',
      'The staff panel’s Schedule view lets you change anyone’s days off, or pick them again with Auto.',
      'Days a role has nobody in show under the schedule, and as a gap in the Calendar tab.',
      'Work someone more than six days in a row and they tire: a little slower and less happy each day.',
      'Existing staff got their days off from the new schedule.',
    ],
  },
  {
    id: 48,
    phase: '21',
    title: 'Training and promotions',
    items: [
      'Send staff on a training course from the staff panel: a day away, paid, for about two weeks of experience.',
      'The advanced course, once each, also lets them grow a star further.',
      'Promote someone at skill 5 with four weeks on the team to their role’s Senior title, one per role.',
      'A senior earns more, is harder for Nazma to poach, helps the rest of their role learn faster and brings a small perk.',
    ],
  },
  {
    id: 49,
    phase: '21',
    title: 'A happier team',
    items: [
      'Click or tap an employee and choose Praise to lift their morale, once a day each.',
      'Hold a morning huddle from your desk before 10:30: everyone at their post gets a boost.',
      'A staff break room (Upgrades tab) keeps the team happier, and idle staff take their breaks in it when it’s quiet.',
      'At month end the hardest worker is Employee of the Month: a bonus, a lift and their name on the showroom’s plaque.',
    ],
  },
  {
    id: 50,
    phase: '21',
    title: 'Employee pages',
    items: [
      'Pick a name in the staff panel or on the Stats tab for their page: hire day, growth, morale and record.',
      'The Stats tab lists the whole team, with days worked and experience.',
      'Five new achievements for growing, promoting and keeping a happy team.',
      'Morale settles back toward the middle faster, so neglect costs less and daily huddles lift less.',
    ],
  },
  {
    id: 51,
    phase: '22',
    title: 'The dealer auction',
    items: [
      'From Main Street, the office computer’s new Auction tab (J) previews the dealer auction held every Wednesday.',
      'Its run list goes up on the Monday: each used car with its grade, miles and what the trade is likely to pay.',
      'Auction days are marked on the Calendar tab.',
    ],
  },
  {
    id: 52,
    phase: '22',
    title: 'Live bidding at the auction',
    items: [
      'On Wednesdays from 10:00 the auction runs live on the Auction tab: bid against the other dealers, or pass on a lot.',
      'The clock keeps running while you bid; a 🔨 chip in the top bar follows the run.',
      'Once it’s over, the tab shows what every lot sold for.',
    ],
  },
  {
    id: 53,
    phase: '22',
    title: 'Auction grades and inspection',
    items: [
      'An auction lot’s grade can be kinder than the car: about one in five is a step worse.',
      'Inspect a lot on the run list for a small fee: a closer grade and a tighter estimate.',
      'The morning after, you hear about any car that came in worse than its grade.',
    ],
  },
  {
    id: 54,
    phase: '22',
    title: 'The used-car manager',
    items: [
      'Once the auction is open, hire a used-car manager. They work from the new kiosk on the lot.',
      'They inspect the whole run list the day before the auction, for free.',
      'Set a max bid on any lot on the Auction tab: they go to the auction and bid it for you while you work the floor.',
    ],
  },
  {
    id: 55,
    phase: '22',
    title: 'Wholesale',
    items: [
      'Send a used car you’d rather not keep to the next dealer auction: Wholesale on the car, or in the Stock tab.',
      'It stays for sale until auction morning, then the other dealers bid on it. You get the price less a seller fee.',
      'Set a floor on the Auction tab: under it the car comes back the next morning, for a small run fee.',
      'A used car you bought today can go straight to the auction from the Stock tab.',
      'Your used-car manager suggests stale cars, and can send long-held ones on their own.',
    ],
  },
  {
    id: 56,
    phase: '22',
    title: 'Nazma at the auction',
    items: [
      'While his lot is open, Nazma bids at the dealer auction too, and harder the more desperate he gets.',
      'A car of yours he buys there goes on his lot across the road.',
      'A car he stole from you can come up in the run, badged Yours, stolen. Buy it back for a lift in reputation.',
      'Now and then the dealers are cool on a lot, and it goes cheap.',
      'Four new auction achievements, and tips for the auction, inspections and wholesale on Easy.',
      'Easy’s dealers bid a little less and its grades are closer to the truth; Hard’s the other way.',
    ],
  },
  {
    id: 57,
    phase: '23',
    title: 'Walkthroughs',
    items: [
      'Walkthroughs: when a feature opens up, a card says what it is.',
      'Walk me through it rings each button or points at the spot, and moves on as you do it.',
      'Later keeps it in How to play’s new Tutorials tab, where you can replay any you’ve unlocked.',
      'On for Easy and Medium, off on Hard: pick at New game, or switch them in the sound panel.',
      'The first one is the dealer auction’s, on your first auction morning at Main Street.',
    ],
  },
  {
    id: 58,
    phase: '23',
    title: 'Your first days',
    items: [
      'A new game walks you through your first sale: greet, ask a price, haggle and close the deal at your desk.',
      'Your first evening explains the day summary, and day two shows you how to order stock and hire staff.',
      'Each can be skipped, or replayed from How to play’s Tutorials tab.',
    ],
  },
  {
    id: 59,
    phase: '23',
    title: 'Walkthroughs for the first encounters',
    items: [
      'New walkthroughs the first time you meet them: used cars, test drives, the F&I menu and your client book.',
      'On day four, a walkthrough of marketing and the Upgrades tab.',
      'A walkthrough about the deal in hand comes up mid-deal, and Easy’s tips don’t repeat what one has shown.',
    ],
  },
  {
    id: 60,
    phase: '23',
    title: 'Walkthroughs as the dealership grows',
    items: [
      'Walkthroughs the morning you reach Main Street, Nazma opens, or your garage or showroom wing goes up.',
      'One for your first raise request, and one on the month’s last day: the quota, CSI and your tier.',
      'A walkthrough that comes up as the day ends waits for the next morning.',
    ],
  },
]

/** The id of the latest update: what a save written by this build has seen. */
export const LATEST_NEWS = UPDATES[UPDATES.length - 1].id

/** The updates after `news`, newest first. Empty when it's up to date. */
export function updatesSince(news: number): Update[] {
  return UPDATES.filter((u) => u.id > news).reverse()
}

/** `updates` grouped by phase, keeping their order, so a phase's sub-phases show together. */
export function groupByPhase(updates: readonly Update[]): { phase: string; updates: Update[] }[] {
  const groups: { phase: string; updates: Update[] }[] = []
  for (const u of updates) {
    const last = groups[groups.length - 1]
    if (last?.phase === u.phase) last.updates.push(u)
    else groups.push({ phase: u.phase, updates: [u] })
  }
  return groups
}

/** Each old save version: the sub-phase that bumped it, and the phases fully shipped by then. */
const LEGACY_NEWS: Record<number, number> = {
  2: 0, // 3f: through Phase 3
  3: 1, // 5a: Phase 4
  4: 2, // 5b/5c: Phase 5
  5: 3, // 7a: Phase 6
  6: 3, // 7b
  7: 4, // 7d: Phase 7
  8: 6, // 9d: Phases 8 and 9
  9: 6, // 10c
  10: 7, // 11a: Phase 10
  11: 8, // 11c: Phase 11
  12: 8, // 12a
  13: 9, // 13a: Phase 12
}

/**
 * The news a save of `version` (from before saves kept it) has already had:
 * the updates whose whole phase had shipped when that version first appeared.
 * A save may have been written later than that, so this can show a player
 * something they've seen, but never leaves out anything new. Unknown versions
 * have seen nothing.
 */
export function legacyNews(version: number): number {
  return LEGACY_NEWS[version] ?? 0
}
