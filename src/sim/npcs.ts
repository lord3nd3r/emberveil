/** NPC dialogue scripts. Each returns the lines to show and an optional effect that runs when the talk ends. */
import { NPCS } from "./data";
import type { Sim } from "./core";

export interface Script {
  who: string;
  lines: string[];
  after?: () => void;
}

export function script(s: Sim, id: string): Script {
  const who = NPCS[id]?.name.replace(/ \(.*\)$/, "") ?? id;
  const f = (n: string) => s.hasFlag(n);
  switch (id) {
    case "isolde": {
      if (f("wardenDead") && s.quest("thirdlamp") < 3) {
        return {
          who,
          lines: s.quest("thirdlamp") === 0
            ? ["Two lamps burn now, Ren: the Cistern's and the Warden's. I felt the second one catch from here.", "The third is in Skyreach Spire, high on the north-east crags. The stormgate beneath it is choked with thorns; the Spire's keeper wants an archer, not a swordsman.", "Mind the wind, and keep your magic full. Mol will not come down for steel."]
            : ["The Spire is open, Ren. Five floors, a belfry key, and thorns that only fire will clear. Go."],
          after: () => { if (s.quest("thirdlamp") === 0) s.setQuest("thirdlamp", 1); },
        };
      }
      if (f("cisternCleared") || f("bossDead")) {
        return {
          who,
          lines: [
            "Ren. You're alive, and the Sluice Throne is quiet. I felt the tide turn from here.",
            "That Heart Lamp you carry was kindled by a guardian's last light. Keep it burning.",
            "This is only the first lamp. The Wardstones in the grove and the spire still sleep, and Vael Orsek is not done with the Veil.",
            "Rest, spend your glints, and come back when you're ready. Aurelane will need her lamp-keeper.",
          ],
          after: () => {
            s.setFlag("cisternCleared");
            s.setFlag("sliceDone");
            s.setQuest("cistern", 4);
            if (s.quest("wardstone") === 0) s.setQuest("wardstone", 1);
          },
        };
      }
      if (!f("metIsolde")) {
        return {
          who,
          lines: [
            "Ren! Thank the lamps, you're awake. The Beacon died in the night. I can feel the Veil fraying in my teeth.",
            "Vael Orsek snuffed the Lantern-Crown. The Hall is dark and its gate is watched, but beneath it lies the Cistern Under-Hall, and it is the only quiet way in.",
            "Take the Keeper's Blade from the chest in your cottage. And this: my old wicker buckler. Hold your guard against anything that flies, and tap the roll key to slip past what you cannot block.",
            "The grate is at Beacon Hall, north along the Lantern Road. I've unsealed it for you. Light every wick you can.",
          ],
          after: () => {
            s.setFlag("metIsolde");
            s.give("wicker_buckler");
            s.setQuest("cistern", 2);
          },
        };
      }
      return {
        who,
        lines: [
          s.hasItem("keeper_blade") ? "The grate at Beacon Hall is open. Follow the Lantern Road north, past the crossroads." : "You still have no blade, Ren. The chest in your cottage, by the bed. Go on.",
          "Tap the sword button to slash, hold it to charge a spin. Hold guard to block, and roll to dodge.",
        ],
      };
    }
    case "marla":
      return { who, lines: ["Tamsin's shop has tonics and hot soup if you're hurt. Bushes hide glints, too, so hack at everything green.", "My nephew swears the hermit's cave leads clean through the cliffs to the plateau. I wouldn't know. I hate the dark."], after: () => s.setFlag("metMarla") };
    case "tam":
      return { who, lines: ["I saw Granny Maple's hen run into the corner pen at the far end of the orchard!", "Don't tell her I said so. She'll make me carry the eggs."], after: () => s.setFlag("metTam") };
    case "kit":
      return { who, lines: ["The Beacon was so bright when I was little. You could see it from the pier.", "Now it's just a black tooth on the hill."], after: () => s.setFlag("metKit") };
    case "tamsin":
      return { who, lines: ["Welcome to the Lampwright's! Trimmed wicks, tonics, hot soup. Have a look at the counter."], after: () => { s.setFlag("metTamsin"); s.openShop(); } };
    case "granny": {
      const q = s.quest("hen");
      if (q === 0)
        return { who, lines: ["Oh, Ren dear! My little Pip has slipped her pen and I can't chase after her with these knees.", "If you bring her home, I'll give you a shard of the old Lantern-Crown's glass. Try the far corner of the orchard."], after: () => s.setQuest("hen", 1) };
      if (q === 1 && !f("henFound")) return { who, lines: ["She likes the little pen in the far corner of the orchard. Please hurry!"] };
      if (q < 3)
        return { who, lines: ["Pip! Oh, bless you, dear. Here, an Ember Shard, wrapped in my own shawl.", "Four of those will kindle a whole new heart. Mind you spend them wisely."], after: () => { s.give("heart_piece"); s.setQuest("hen", 3); } };
      return { who, lines: ["Pip is laying twice a day now. You're a treasure."] };
    }
    case "oswin": {
      const q = s.quest("lantern");
      if (q === 0)
        return { who, lines: ["Ah, a lamp-keeper's apprentice. I lost my brass lantern on a dry mound in the Reedmarsh when the Veil tore.", "A ferryman without a light is just a man with a boat. Fetch it and I'll pay you well."], after: () => s.setQuest("lantern", 1) };
      if (q === 1 && !s.hasItem("brass_lantern")) return { who, lines: ["Reedmarsh is west and south of Emberfen. Look for a dry mound among the ponds."] };
      if (q < 3)
        return { who, lines: ["That's her! Bless your hands. Fifty glints, as promised."], after: () => { s.take("brass_lantern"); s.addGlints(50); s.setQuest("lantern", 3); } };
      return { who, lines: ["She burns bright again. Safe lamps, Ren."] };
    }
    case "bram":
      return {
        who,
        lines: [
          "Mmm. Another one wandering in. The cliffs only go one way down, lad, so take the tunnel if you want to come back up.",
          "Deep in the cistern a disc of wind lies sleeping behind a great chest. You will need the big key from the one who guards the reliquary.",
          "A crystal you cannot reach is a crystal waiting for a thrown thing. And the tide-beast's hide shrugs off steel until the wind stuns it.",
        ],
        after: () => s.setFlag("metBram"),
      };
    case "pell": {
      const q = s.quest("folio");
      if (q === 0)
        return { who, lines: ["Careful with the damp! Oh, a visitor. You wouldn't be heading to the Mossgate Ruins, would you?", "I left my folio there, the only copy of the dash-sole pattern. Find it and I'll make you boots that spiral over any chasm."], after: () => s.setQuest("folio", 1) };
      if (q === 1 && !s.hasItem("archivist_folio")) return { who, lines: ["The Mossgate stair is under the clearing in Whispering Grove, far to the north-west. It only wakes after the first lamp is lit."] };
      if (q < 3)
        return { who, lines: ["My folio! Dry, even. Bless you.", "Here: Spiral Boots, stitched to the old pattern. Press the item key to dash across up to three tiles of nothing, and through cracked rubble."], after: () => { s.take("archivist_folio"); s.give("spiral_boots"); s.setFlag("gotBoots"); s.setQuest("folio", 3); } };
      return { who, lines: ["The boots will wear in nicely. Mind the chasms, and mind the rubble."] };
    }
    case "garrick": {
      if (s.quest("parcel") === 1 && s.hasItem("parcel"))
        return { who, lines: ["A parcel from Ferris? Ha, I'd given it up for lost. Here, sixty glints for the walk.", "Take a look at the counter, too."], after: () => { s.take("parcel"); s.addGlints(60); s.setQuest("parcel", 3); s.openShop("outpost"); } };
      return { who, lines: ["Kestrel Outpost! Few climb this far. I carry what the road needs.", "Take a look at the counter."], after: () => s.openShop("outpost") };
    }
    case "nell": {
      const q = s.quest("feather");
      if (q === 0) return { who, lines: ["Heron Island is never quiet, and the feathers there make the best floats.", "Cross the long bridge from the north shore and fetch me one? I'll give you a shard of the old Crown's glass."], after: () => s.setQuest("feather", 1) };
      if (q === 1 && !s.hasItem("heron_feather")) return { who, lines: ["The bridge starts on the north shore, past the road. The feather lies where the herons nest."] };
      if (q < 3) return { who, lines: ["That's a prize float! Here, an Ember Shard, as promised."], after: () => { s.take("heron_feather"); s.give("heart_piece"); s.setQuest("feather", 3); } };
      return { who, lines: ["Best float on the lake. The fish don't stand a chance."] };
    }
    case "ferris": {
      const q = s.quest("parcel");
      if (q === 0) return { who, lines: ["You look like you walk a lot. Would you carry a parcel to Garrick at Kestrel Outpost? It's up on the plateau, past the standing stones.", "My knees won't do the ramps. He'll pay you for the trouble."], after: () => { s.give("parcel"); s.setQuest("parcel", 1); } };
      if (q < 3) return { who, lines: ["Garrick's at the outpost, up the ramp from the Windward Steps. Thank you!"] };
      return { who, lines: ["I'm walking to Crownwatch, but they say the Keep is barred. Three wardstones, they say. I'll wait."] };
    }
    case "mossa": {
      const q = s.quest("waterskin");
      if (q === 0) return { who, lines: ["I dropped my waterskin in the Sand Vault, the cave in the long scarp north of here, and the bats chased me out.", "Bring it back and I'll give you a shard. I know where it'd be best used."], after: () => s.setQuest("waterskin", 1) };
      if (q === 1 && !s.hasItem("waterskin")) return { who, lines: ["The Sand Vault is a cave mouth in the scarp to the north of the oasis. Mind the bats."] };
      if (q < 3) return { who, lines: ["My skin! Cracked, but mine. Here, a shard, and thank you.", "East of here a tomb is sealed by a slab. I've pushed it. It won't budge."], after: () => { s.take("waterskin"); s.give("heart_piece"); s.setQuest("waterskin", 3); } };
      return { who, lines: ["The oasis never dries. A hundred years of lantern-keepers drank here."] };
    }
    case "pip":
      if (s.quest("hen") >= 1)
        return { who: "Pip", lines: ["Pip clucks indignantly, then settles into your arms. Time to go home."], after: () => { s.setFlag("henFound"); s.setQuest("hen", 2); } };
      return { who: "Pip", lines: ["A hen glares at you. She looks like she belongs to someone nearby."] };
    default:
      return { who, lines: ["..."] };
  }
}
