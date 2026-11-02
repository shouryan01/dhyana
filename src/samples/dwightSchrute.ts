/**
 * Sample journal: a year (2026) of entries written as Dwight Schrute, for testing the app with
 * something real-looking. Fiction, written for dhyana's own testing. Feelings are written as
 * inline emotions (`[[sad]]`, what typing `!sad` produces), people and places are links, and
 * topics are tags. Mood check-ins are deliberately left out.
 */

export interface SampleEntry {
  /** Journal day, `YYYY-MM-DD`. */
  date: string;
  /** Markdown body, as it is written to the day's file. */
  body: string;
}

/** People and places that the entries link to, so their pages exist and the links resolve. */
export const SAMPLE_PEOPLE = ["Jim", "Pam", "Angela", "Michael", "Mose"] as const;
export const SAMPLE_PLACES = ["Schrute Farms", "Dunder Mifflin Scranton"] as const;

export const SAMPLE_ENTRIES: SampleEntry[] = [
  {
    date: "2026-01-02",
    body: `New year. Three goals, written in pen so they cannot be negotiated away:

1. Become Regional Manager. Michael has been told. He nodded in a way that suggested he had not understood.
2. Increase the beet yield at [[Schrute Farms]] by fifteen percent. The beets are the foundation of everything.
3. Stop letting [[Jim]] near my stapler. #goals #office

The calendar says it is a Friday. I have already been in since six.`,
  },
  {
    date: "2026-01-14",
    body: `Harvest at [[Schrute Farms]]. Forty-one crates of beets before lunch. [[Mose]] wanted to take a break and I explained that beets do not wait, and neither does the frost.

Mose asked if I was happy. I told him beets do not make me happy, they make me [[proud]]. He said that is the same thing for me. He is wrong, but I did not have time to correct him. #beets #farm`,
  },
  {
    date: "2026-01-28",
    body: `[[Jim]] filled my desk drawer with Jell-O. Not one cup. He used a stack of them and arranged them so the drawer looked normal until I opened it.

I was [[angry]] for approximately four minutes. Then I was calm, because I had already calculated that the Jell-O would be easier to clean up than the consequences. I put the cups in the break room fridge and labelled them with my name. #pranks #office`,
  },
  {
    date: "2026-02-09",
    body: `Fire drill, scheduled by [[Michael]] without informing anyone except the building. I was the designated fire marshal, which is an official role and not a costume.

We evacuated in four minutes and eleven seconds. Michael said it was a good drill. I said it was a terrible drill because he forgot the fire exits on the second floor. He was [[annoyed]]. I was [[proud]]. Both outcomes are acceptable. #fire-drill #office`,
  },
  {
    date: "2026-02-20",
    body: `The Dunder Mifflin work bus to the regional sales event. Forty minutes in a vehicle with [[Jim]] and [[Michael]] singing badly.

I sat in the front seat so that I could see the road, and I was correct to do so: at one point Michael would have driven us into a lake. [[Pam]] sat in the back and laughed at things I had not said. I would like to think she was laughing with me. #work-bus #office`,
  },
  {
    date: "2026-03-03",
    body: `Pam came to reception before lunch and said good morning, and I said good morning back. That is three words in a row and she did not seem to mind.

I brought her a beet cupcake from the farm. She ate half of it and said it tasted like a vegetable. I took this as a compliment, because it is one. I am [[happy]] that she tried it. #pam #beets`,
  },
  {
    date: "2026-03-14",
    body: `[[Angela]] has a cat called Sprinkles. Sprinkles is not a cat. Sprinkles is a small, cold, judgemental animal that has decided I am its enemy.

It sat on my keyboard during the quarterly report. I moved it. Angela said I was cruel. I said a cat in a keyboard is a security breach, not a pet. Angela did not agree and I was [[frustrated]] for the rest of the afternoon. #angela #office`,
  },
  {
    date: "2026-03-22",
    body: `[[Jim]] has now moved my stapler into the office freezer, my stapler into a cup of water on my desk, and my stapler into the printer tray. I have no stapler and no plan.

I am reporting this to the office for the record. I am also documenting the time. It is 10:14 and I am [[angry]] in a way I did not know I could feel before 9 a.m. #pranks #jim`,
  },
  {
    date: "2026-04-05",
    body: `Dinner with [[Pam]] at the Italian place that does not know what a beet is. I asked for the wine list and she asked for the bread, and we agreed to be very different people in a very compatible way.

She told me about her art. I told her about bears. Neither of us was bored. I am [[happy]] in a way that is inefficient and I do not intend to fix it. #pam #date`,
  },
  {
    date: "2026-04-19",
    body: `[[Angela]] and I have ended our relationship. We discussed it for an hour in the conference room, and both agreed that the relationship was not as efficient as we had hoped.

I am [[sad]]. I know that is not a Schrute trait. I did not consult the handbook. I went home and sat in the car for a while, then went inside and organised the spice rack alphabetically, which helped, slightly. #angela #heartbreak`,
  },
  {
    date: "2026-04-20",
    body: `Less efficient than yesterday. I sat at my desk for most of the morning and did not sell a single paper. [[Jim]] made a point of asking if I was alright, in the voice he uses when he already knows the answer and wants to watch me say it.

I said I was fine. I am not fine. I am [[lonely]] and I have decided to write it down rather than tell anyone at the office, because they would make a poster. #feelings`,
  },
  {
    date: "2026-05-02",
    body: `Mose and I took the bees out for their spring inspection. Three hives, two queens, and one hive that is clearly planning something.

Mose wore no protection. He said the bees "know him". I explained that the bees know nothing and that his arms were swelling. He was fine. I was [[anxious]] for the entire forty minutes, and I would do it again. #farm #bees`,
  },
  {
    date: "2026-05-18",
    body: `[[Jim]] swapped the nameplates on the sales desks so that my name was on [[Pam]]'s desk and hers was on mine. I did not notice for three hours. When I did notice I was [[angry]] at myself, not at him, because a good salesman checks his own name.

Pam found it funnier than I did. She said she would keep my nameplate. I am still deciding whether that is a threat or a gift. #pranks #jim`,
  },
  {
    date: "2026-06-01",
    body: `Beet season starts early this year. The ground is warm and the seedlings have already doubled in a week. [[Mose]] wants to add a second greenhouse. I want to add a second hour to the day.

We compromised: one greenhouse, and I will get up at four. Fine. This is what leadership looks like. #beets #farm #schrute-farms`,
  },
  {
    date: "2026-06-16",
    body: `Michael held a "Dinner Party" in the break room. He invited the whole office, served microwave lasagne, and gave a speech about the importance of family, to a room that was mostly in the building because of a free lunch.

I was [[embarrassed]] for him, then [[proud]] of how many people stayed to the end. [[Pam]] stayed. She said I was the only one who ate the salad. I said the salad was the only good food in the building. #michael #office`,
  },
  {
    date: "2026-07-08",
    body: `Scared, for the first time this year. I was alone in the warehouse after close, counting inventory on the top shelf, when the motion light went off. Someone had moved the ladder. I did not find out who. I suspect [[Jim]], and I am not ruling out the cat.

I got down safely and finished the count. The numbers were correct. I was still [[scared]] at home, and I slept with the light on for the first time since I was nine. #office #fear`,
  },
  {
    date: "2026-07-22",
    body: `Sales award for the second quarter. Top seller, Dunder Mifflin Scranton, fourth year running. I gave a short speech. [[Michael]] gave a longer one. Nobody counted the minutes, but I did, and his was eleven minutes longer.

I was [[proud]] of the team. I was [[happy]] to see [[Pam]] clapping at the back, and I was [[grateful]] for the plaque, which is solid oak and will not be used as a coaster. #awards #work`,
  },
  {
    date: "2026-08-05",
    body: `[[Pam]] asked me to help paint the reception area. We spent a Saturday with rollers and a bucket of a colour the paint shop called "Harvest Wheat". It is more of an orange. It is also more beautiful than I expected, and I told her so.

She told me I am the least boring person she knows. I took it as the highest compliment I have ever received, and I will be taking it to my grave. I am [[happy]] and slightly sunburnt. #pam #home`,
  },
  {
    date: "2026-08-19",
    body: `[[Michael]] has decided to move to Colorado. He announced it in the parking lot, to the car, while the car was driving away. He is not moving to Colorado. He is moving to a motel for a week, which he has described as "a new chapter".

I am [[annoyed]], mostly because he has not yet signed the handover documents for the sales territory, and the territory does not transfer itself. #michael #office`,
  },
  {
    date: "2026-09-04",
    body: `[[Angela]] asked me to return the things I kept from our relationship. A lamp. Two coffee mugs. A bowl I bought for a dinner that never happened. Sprinkles was not on the list, although I am now certain it wanted to be.

I returned everything in a box with a label. I did not cry. I was [[sad]] at the front door for a sensible amount of time. Then I took the long way to the farm. #angela #heartbreak`,
  },
  {
    date: "2026-09-16",
    body: `[[Jim]] set up a fake phone number on my business card and forwarded it to the office line. I spent an afternoon answering calls from people who wanted to know if I was "the beet guy". Some of them were very polite. One of them asked for a quote on fifty acres of corn.

I was [[annoyed]] at first. By four o'clock I was [[amused]], and I told Jim so, which I believe was a mistake, because he has now ordered three hundred more business cards. #pranks #jim`,
  },
  {
    date: "2026-10-01",
    body: `The bed-and-breakfast at [[Schrute Farms]] opened for the season. Four guests in the first week, all of them from the Scranton area, all of them interested in the beets. I wrote the house rules myself. Rule six is: no hats at the dinner table.

It is [[proud]] work. I cooked breakfast, showed the barn, and told one guest the history of the farm twice because the first time he fell asleep. #farm #schrute-farms`,
  },
  {
    date: "2026-10-14",
    body: `The office carnival, organised by [[Michael]] and [[Pam]]. There was a dunk tank, a bouncy castle that Michael was not allowed to bounce in, and a stall of face paint that [[Jim]] turned into a joke about my face.

I did not get painted. I won a cake in the ring toss, which I think is a fair result. I was [[happy]] in the way you are happy when a day has no plans and goes well anyway. #office #carnival`,
  },
  {
    date: "2026-10-28",
    body: `[[Pam]] and [[Jim]] are engaged. I found out from the office newsletter, which was printed on the good paper. I was not surprised. I had seen the way they looked at the vending machine together. Nobody looks at a vending machine like that unless they have decided something.

I was [[happy]] for them, and I was [[grateful]] to be asked to stand at the back. Nobody will be asking me to stand anywhere else. #pam #jim`,
  },
  {
    date: "2026-11-15",
    body: `Quarterly review. The numbers are good. Dunder Mifflin Scranton is ahead of every other branch in the region, and [[Michael]] is still not Regional Manager, which is a relief to everyone except him.

I made a list of things I am [[grateful]] for: the beets, the farm, the people at the office who put up with me, [[Pam]] for the bread at dinner, and Sprinkles, who has at least never pretended to like me. #goals #work`,
  },
  {
    date: "2026-12-01",
    body: `The farm is quiet in winter. The beets are in storage, the bees are sleeping, and [[Mose]] is building a bench that I have already told him is structurally unsound.

I walked the fence line this morning. I was [[calm]], which I do not say often, and I intend to take it seriously. Calm is an asset. It can be recorded and brought out when needed. #farm #winter`,
  },
  {
    date: "2026-12-31",
    body: `Year in review, written at the kitchen table with the good pen.

I am Assistant Regional Manager. I have not been made Regional Manager, and I have decided that is a decision for next year. I sold a lot of paper, ate a lot of beets, and was [[angry]], [[sad]], [[lonely]] and [[anxious]] at various times, which I will not pretend did not happen.

I was [[happy]] more often than I expected. Most of the time that was [[Pam]]. The rest was the farm. Next year: fewer Jell-O cups, more beets, and a better sense of what to do when a motion light goes off. #year-in-review`,
  },
];
