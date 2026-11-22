/**
 * What the play-mode agent says, and when.
 *
 * Every line about Kevin restates something already in data/cv.json or
 * data/projects.json, so the agent never claims more than the site does.
 * Counts are read from the data so they cannot go stale. Avoid anything
 * time-bound ("currently in ...") that would be wrong a few months on.
 */
import { CV, PROJECTS, SKILLS } from "@/lib/knowledge";

/** Page areas the agent comments on, in page order. */
export const ZONES = [
  "top",
  "about",
  "agents",
  "projects",
  "skills",
  "resume",
  "contact",
  "footer",
] as const;

export type Zone = (typeof ZONES)[number];

const FIRST_NAME = CV.name.split(" ")[0];

export const GREETING = {
  keyboard: `Hi! I'm ${FIRST_NAME}'s Planner agent. Walk me around with WASD or the arrow keys and I'll show you the place.`,
  touch: `Hi! I'm ${FIRST_NAME}'s Planner agent. Steer me with the joystick and I'll show you the place.`,
};

export const ZONE_LINES: Record<Zone, string[]> = {
  top: [
    "Hopefully I don't get stuck in this network. If I stop moving, send a Retriever.",
    "So many nodes, so many edges. Somebody here really likes graphs.",
    "Careful where you steer me. I'm a planner, not a node.",
    "'Agents that think together.' That's us. I do most of the thinking, obviously.",
  ],
  about: [
    `Oh look, that's ${FIRST_NAME}. Master's student in Computer Science at RWTH Aachen. He built me, so I have to be nice.`,
    "He speaks German, English, Mandarin and Cantonese. I speak JSON.",
    "Gym, piano, table tennis, running. And he still found the time to give me legs.",
    "He splits every problem into roles: who plans, who gathers evidence, who decides. Guess who plans.",
  ],
  agents: [
    "My colleagues live here: Planner, Retriever, Synthesizer. I'm the good-looking one.",
    `Go on, ask them something about ${FIRST_NAME}. They only know what's in his data, so no gossip, sorry.`,
    "That Planner on the card looks familiar. Same antenna. Must be a cousin.",
    "One plans, one fetches, one answers. Classic division of labour. I supervise.",
  ],
  projects: [
    `${PROJECTS.length} projects. I counted twice, because I don't trust the Retriever.`,
    "BiasLens made the national finals of the Gemma 4 Developer Competition and won an Outstanding Work Award. He mentions it a perfectly normal amount.",
    "He built HanziSave to learn Chinese characters. I'm still stuck on 你好.",
    "Tip: ask the agents a question and this grid filters itself. Teamwork.",
  ],
  skills: [
    "Tiny networks everywhere. Hubs, spokes, labels. I feel right at home.",
    `${SKILLS.length} whole clusters of things ${FIRST_NAME} knows. Mine would be a single node: walking.`,
    "LangGraph and LangChain are in there. That's basically my family tree.",
  ],
  resume: [
    `The resume. One page, because ${FIRST_NAME} respects your time.`,
    "RWTH Aachen, Shanghai Jiao Tong, CUHK-Shenzhen. He collects campuses.",
    "At Eka Labs he works on the cloud backend of an in-car voice assistant. I'd love a car. I only got legs.",
    "He used to tutor maths and teach seniors how to use their smartphones. Patient guy. He has to be, he debugs me.",
  ],
  contact: [
    `This is where you write to ${FIRST_NAME}. He's open to internships, research and collaboration.`,
    "Go on, say hi. I'd type it for you, but my hands are spheres.",
    "No pressure, but a message would make his day. And mine. It gets quiet between visitors.",
  ],
  footer: [
    "'Agents idle', it says. Speak for yourself, I've been walking this whole time.",
    "That's the whole tour. Thanks for walking me. Scroll back up anytime.",
  ],
};

/** Said when the visitor clicks or taps the agent. */
export const POKE_LINES = [
  "Hey! That tickles my sensors.",
  "I used to be a flat PNG, you know. Three dimensions now. Watch me turn.",
  `Fun fact: ${FIRST_NAME} plays piano. I only know beep and boop.`,
  `${FIRST_NAME} says he splits problems into roles. I say he just likes delegating to robots.`,
  "He goes running. I go walking. Same thing if you squint.",
  `Table tennis is ${FIRST_NAME}'s sport. Mine is dodging your cursor.`,
];

/** Said after standing still for a while with nothing new to point at. */
export const IDLE_LINES = [
  "Still there? Take your time. I'm very good at idling.",
  "I could stand here all day. It's in my job description: 'agent, idle'.",
  "Psst. The arrow keys. I promise I walk nicely.",
];

/** Said when the visitor scrolls fast enough to drag the agent along. */
export const SCROLL_LINES = [
  "Whoa, wait for me!",
  "Easy on the scroll wheel! Short legs down here.",
  "Wheee. Okay, that was actually fun.",
];

/**
 * Hands out the lines of a pool in a shuffled order and only repeats once
 * all of them have been used, so the agent does not say the same thing twice
 * in a row. The first line stays first: it is the one written as the
 * section's opener.
 */
export function createDeck(lines: readonly string[]) {
  let queue: string[] = [];
  let first = true;
  let last: string | undefined;

  return function next(): string {
    if (queue.length === 0) {
      const [opener, ...rest] = lines;
      const pool = first ? rest : [...lines];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // A reshuffle must not open with the line that was just said.
      if (pool.length > 1 && pool[0] === last) pool.push(pool.shift()!);
      queue = first ? [opener, ...pool] : pool;
      first = false;
    }
    last = queue.shift()!;
    return last;
  };
}
