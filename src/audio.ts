import { settings, settingsStore } from "./settings";
import type { SfxName } from "./sim/types";
/**
 * Procedural audio: a small generative music engine (one original track per area plus title,
 * battle, boss, victory and ending) and the shared sound-effect bus. Everything is synthesised
 * with WebAudio; there are no audio files. Nothing starts until the first user gesture.
 */

export type TrackId = "title" | "meadow" | "wood" | "village" | "highland" | "hall" | "marsh" | "cave" | "cistern" | "miniboss" | "boss" | "victory" | "castle" | "desert" | "lake" | "mountain" | "plateau" | "moss" | "spire" | "bosswarden" | "bossstorm" | "keep" | "finalboss" | "credits";
export const TRACKS: TrackId[] = ["title", "meadow", "wood", "village", "highland", "hall", "marsh", "cave", "cistern", "miniboss", "boss", "victory", "castle", "desert", "lake", "mountain", "plateau", "moss", "spire", "bosswarden", "bossstorm", "keep", "finalboss", "credits"];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const PHRYG = [0, 1, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];

const R = -99; // rest
const T = 99; // tie (hold previous note)

type Wave = OscillatorType;
type DrumStyle = "none" | "soft" | "march" | "rock" | "tribal" | "heart" | "taiko" | "waltz" | "fanfare";
type BassStyle = "none" | "root" | "rootfifth" | "pulse" | "oct" | "sync" | "drone" | "oompah";

interface Spec {
  bpm: number;
  meter: number; // beats per bar
  root: number; // MIDI note of the tonic
  scale: number[];
  chords: number[]; // 8 bars, scale-degree roots
  motif: number[];
  lead: { type: Wave; gain: number; oct: number; vib: number; atk: number; rel: number; cutoff: number; echo: number; layer?: Wave };
  pad?: { type: Wave; gain: number; cutoff: number; atk: number };
  bass?: { style: BassStyle; type: Wave; gain: number };
  arp?: { pattern: number[]; type: Wave; gain: number; oct: number; len: number };
  drums: DrumStyle;
  drumGain: number;
  swing: number;
  reverb: number;
  seventh?: boolean;
}

const SPECS: Record<TrackId, Spec> = {
  // Emberveil theme: slow lydian rise over a warm drone
  title: {
    bpm: 70, meter: 4, root: 62, scale: LYDIAN, chords: [0, 4, 1, 3, 0, 5, 4, 0],
    motif: [0, T, 2, T, 4, T, T, 6, 5, T, 4, T, 2, T, T, R],
    lead: { type: "triangle", gain: 0.075, oct: 1, vib: 3, atk: 0.03, rel: 1.3, cutoff: 5000, echo: 0.4, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.022, cutoff: 900, atk: 1.2 },
    bass: { style: "drone", type: "sine", gain: 0.1 },
    arp: { pattern: [0, 1, 2, 3, 2, 1, 2, 1], type: "sine", gain: 0.04, oct: 1, len: 0.9 },
    drums: "none", drumGain: 0, swing: 0, reverb: 0.55,
  },
  // Open fields: bright, walking pace
  meadow: {
    bpm: 108, meter: 4, root: 57, scale: MAJOR, chords: [0, 3, 4, 0, 5, 3, 4, 0],
    motif: [4, T, 2, 4, 5, T, 4, T, 2, T, 0, 2, 4, T, T, R],
    lead: { type: "triangle", gain: 0.08, oct: 1, vib: 0, atk: 0.005, rel: 0.5, cutoff: 3800, echo: 0.22, layer: "sine" },
    pad: { type: "triangle", gain: 0.02, cutoff: 800, atk: 0.5 },
    bass: { style: "rootfifth", type: "triangle", gain: 0.11 },
    arp: { pattern: [0, 2, 1, 2, 1, 2, 0, 1], type: "triangle", gain: 0.026, oct: 1, len: 0.5 },
    drums: "soft", drumGain: 0.4, swing: 0.06, reverb: 0.28,
  },
  // Gloamwood and Whispering Grove: dorian, hushed
  wood: {
    bpm: 84, meter: 4, root: 52, scale: DORIAN, chords: [0, 3, 0, 4, 0, 5, 3, 0],
    motif: [0, T, 2, T, 4, T, 3, 2, 0, T, T, R, 2, T, 1, R],
    lead: { type: "sine", gain: 0.085, oct: 1, vib: 4, atk: 0.08, rel: 0.9, cutoff: 2800, echo: 0.45, layer: "triangle" },
    pad: { type: "sawtooth", gain: 0.02, cutoff: 600, atk: 1.2 },
    bass: { style: "pulse", type: "sine", gain: 0.1 },
    arp: { pattern: [0, R, 2, R, 1, R, 3, R], type: "sine", gain: 0.04, oct: 2, len: 0.7 },
    drums: "heart", drumGain: 0.3, swing: 0, reverb: 0.7,
  },
  // Emberfen village: waltz
  village: {
    bpm: 100, meter: 3, root: 55, scale: MAJOR, chords: [0, 3, 4, 0, 1, 3, 4, 0],
    motif: [4, T, 2, 3, 4, 5, 7, T, T, 5, T, 4],
    lead: { type: "triangle", gain: 0.08, oct: 1, vib: 0, atk: 0.005, rel: 0.5, cutoff: 3600, echo: 0.2, layer: "sine" },
    pad: { type: "triangle", gain: 0.02, cutoff: 700, atk: 0.5 },
    bass: { style: "oompah", type: "triangle", gain: 0.11 },
    arp: { pattern: [0, 2, 1, 2, 1, 2], type: "triangle", gain: 0.03, oct: 1, len: 0.5 },
    drums: "waltz", drumGain: 0.5, swing: 0.05, reverb: 0.25,
  },
  // Ashfall Rise and Cinder Heights: mixolydian, wide
  highland: {
    bpm: 96, meter: 4, root: 55, scale: MIXO, chords: [0, 6, 3, 0, 0, 6, 4, 0],
    motif: [0, T, T, 4, 5, T, 4, 2, 4, T, T, R, 2, T, 0, R],
    lead: { type: "sawtooth", gain: 0.048, oct: 1, vib: 3, atk: 0.04, rel: 0.5, cutoff: 2200, echo: 0.3 },
    pad: { type: "triangle", gain: 0.024, cutoff: 1000, atk: 0.8 },
    bass: { style: "rootfifth", type: "triangle", gain: 0.12 },
    arp: undefined,
    drums: "march", drumGain: 0.4, swing: 0, reverb: 0.4,
  },
  // Beacon Hall Grounds: solemn, minor
  hall: {
    bpm: 72, meter: 4, root: 50, scale: MINOR, chords: [0, 5, 3, 4, 0, 5, 6, 0],
    motif: [0, T, T, 2, 4, T, T, R, 3, T, 2, T, 0, T, T, R],
    lead: { type: "triangle", gain: 0.07, oct: 1, vib: 4, atk: 0.1, rel: 1.4, cutoff: 2600, echo: 0.45, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.026, cutoff: 700, atk: 1.4 },
    bass: { style: "drone", type: "sine", gain: 0.12 },
    arp: { pattern: [R, 2, R, 1, R, 3, R, 2], type: "sine", gain: 0.035, oct: 2, len: 0.8 },
    drums: "taiko", drumGain: 0.25, swing: 0, reverb: 0.8,
  },
  // Reedmarsh and the coast: watery, swung
  marsh: {
    bpm: 92, meter: 4, root: 53, scale: LYDIAN, chords: [0, 1, 0, 4, 0, 1, 5, 4],
    motif: [4, R, 2, T, 4, T, 6, R, 5, T, 4, R, 2, T, 0, R],
    lead: { type: "sine", gain: 0.085, oct: 1, vib: 3, atk: 0.02, rel: 1.0, cutoff: 4200, echo: 0.55, layer: "triangle" },
    pad: { type: "triangle", gain: 0.026, cutoff: 1200, atk: 1.0 },
    bass: { style: "pulse", type: "sine", gain: 0.1 },
    arp: { pattern: [0, 2, 1, 3, 2, 3, 1, 2], type: "sine", gain: 0.035, oct: 2, len: 0.6 },
    drums: "soft", drumGain: 0.3, swing: 0.2, reverb: 0.75,
  },
  // Hermit's Cave and caches: drips and low tension
  cave: {
    bpm: 64, meter: 4, root: 46, scale: PHRYG, chords: [0, 0, 1, 0, 5, 0, 1, 0],
    motif: [0, T, T, R, 1, T, R, R, 0, T, 4, T, 3, T, R, R],
    lead: { type: "triangle", gain: 0.06, oct: 1, vib: 3, atk: 0.06, rel: 1.5, cutoff: 1800, echo: 0.6, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.018, cutoff: 420, atk: 2 },
    bass: { style: "drone", type: "sine", gain: 0.1 },
    arp: { pattern: [R, R, 3, R, R, R, 2, R], type: "sine", gain: 0.05, oct: 2, len: 1.2 },
    drums: "heart", drumGain: 0.4, swing: 0, reverb: 0.9,
  },
  // Cistern Under-Hall: dripping harmonic minor pulse
  cistern: {
    bpm: 82, meter: 4, root: 48, scale: HARM, chords: [0, 5, 2, 3, 0, 5, 6, 0],
    motif: [0, R, 2, R, 3, R, 2, 0, R, 6, R, 4, 3, R, 2, R],
    lead: { type: "triangle", gain: 0.07, oct: 1, vib: 2, atk: 0.004, rel: 0.6, cutoff: 2400, echo: 0.5, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.02, cutoff: 540, atk: 1.4 },
    bass: { style: "pulse", type: "triangle", gain: 0.1 },
    arp: { pattern: [0, 2, 1, 2, 0, 2, 3, 2], type: "triangle", gain: 0.035, oct: 1, len: 0.35 },
    drums: "tribal", drumGain: 0.45, swing: 0.08, reverb: 0.65,
  },
  // Gaol-Marshal: stomping march
  miniboss: {
    bpm: 128, meter: 4, root: 50, scale: MINOR, chords: [0, 0, 5, 6, 0, 0, 3, 4],
    motif: [0, 0, R, 2, 0, R, 3, 4, 0, 0, R, 5, 4, R, 3, 2],
    lead: { type: "sawtooth", gain: 0.045, oct: 1, vib: 0, atk: 0.003, rel: 0.1, cutoff: 3000, echo: 0.14, layer: "square" },
    pad: { type: "sawtooth", gain: 0.016, cutoff: 700, atk: 0.1 },
    bass: { style: "pulse", type: "sawtooth", gain: 0.07 },
    arp: { pattern: [0, 2, 1, 2, 0, 2, 1, 3], type: "square", gain: 0.012, oct: 1, len: 0.3 },
    drums: "march", drumGain: 0.85, swing: 0, reverb: 0.2,
  },
  // Sluicejaw: fast phrygian taiko
  boss: {
    bpm: 160, meter: 4, root: 47, scale: PHRYG, chords: [0, 1, 0, 6, 0, 1, 4, 3],
    motif: [0, R, 1, 0, R, 0, 4, 3, 0, R, 1, 0, R, 5, 4, 1],
    lead: { type: "sawtooth", gain: 0.05, oct: 1, vib: 6, atk: 0.003, rel: 0.12, cutoff: 3600, echo: 0.2, layer: "square" },
    pad: { type: "sawtooth", gain: 0.026, cutoff: 600, atk: 0.2 },
    bass: { style: "sync", type: "sawtooth", gain: 0.08 },
    arp: { pattern: [0, 1, 2, 1, 0, 2, 1, 2], type: "sawtooth", gain: 0.012, oct: 1, len: 0.25 },
    drums: "taiko", drumGain: 1, swing: 0, reverb: 0.3, seventh: true,
  },
  // Crownwatch Moat and the castle road: stately minor waltz
  castle: {
    bpm: 96, meter: 3, root: 50, scale: MINOR, chords: [0, 5, 3, 4, 0, 5, 6, 0],
    motif: [0, T, 2, 3, T, 4, 3, T, 2, 0, T, T, 4, T, 5, 4, 3, T, 2, T, 0, T, T, R],
    lead: { type: "triangle", gain: 0.075, oct: 1, vib: 3, atk: 0.02, rel: 0.5, cutoff: 3200, echo: 0.35, layer: "sawtooth" },
    pad: { type: "sawtooth", gain: 0.02, cutoff: 800, atk: 0.6 },
    bass: { style: "oompah", type: "triangle", gain: 0.1 },
    drums: "waltz", drumGain: 0.5, swing: 0, reverb: 0.55,
  },
  // Ashglass Dunes: hot phrygian-dominant crawl with a droning bass
  desert: {
    bpm: 88, meter: 4, root: 45, scale: HARM, chords: [0, 0, 1, 0, 0, 4, 1, 0],
    motif: [4, R, 5, 4, 2, T, 1, 2, 3, T, T, R, 1, 2, 1, 0],
    lead: { type: "sawtooth", gain: 0.045, oct: 1, vib: 5, atk: 0.03, rel: 0.5, cutoff: 2600, echo: 0.4, layer: "triangle" },
    pad: { type: "triangle", gain: 0.03, cutoff: 900, atk: 1.2 },
    bass: { style: "drone", type: "triangle", gain: 0.11 },
    arp: { pattern: [0, 2, 3, 2, 4, 2, 3, 2], type: "triangle", gain: 0.03, oct: 2, len: 0.4 },
    drums: "tribal", drumGain: 0.5, swing: 0.1, reverb: 0.5,
  },
  // Greatwater: open, rolling lydian waves
  lake: {
    bpm: 72, meter: 3, root: 55, scale: LYDIAN, chords: [0, 4, 1, 4, 0, 5, 1, 4],
    motif: [0, T, 2, 4, T, T, 5, T, 4, 2, T, T, 1, T, 2, 0, T, T],
    lead: { type: "sine", gain: 0.09, oct: 1, vib: 4, atk: 0.04, rel: 1.2, cutoff: 5000, echo: 0.6, layer: "triangle" },
    pad: { type: "sine", gain: 0.04, cutoff: 1500, atk: 1.5 },
    bass: { style: "root", type: "sine", gain: 0.1 },
    arp: { pattern: [0, 2, 4, 2, 1, 3, 5, 3], type: "sine", gain: 0.04, oct: 2, len: 0.7 },
    drums: "soft", drumGain: 0.2, swing: 0.1, reverb: 0.85,
  },
  // Emberspine Range: wide fifths, sparse and cold
  mountain: {
    bpm: 76, meter: 4, root: 52, scale: DORIAN, chords: [0, 0, 4, 3, 0, 5, 4, 0],
    motif: [0, T, T, T, 4, T, 3, T, 2, T, T, R, 0, T, 2, T],
    lead: { type: "triangle", gain: 0.08, oct: 1, vib: 2, atk: 0.1, rel: 1.4, cutoff: 3000, echo: 0.7, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.022, cutoff: 700, atk: 1.6 },
    bass: { style: "drone", type: "sine", gain: 0.11 },
    drums: "heart", drumGain: 0.3, swing: 0, reverb: 0.9,
  },
  // Kestrel Plateau: windy mixolydian canter
  plateau: {
    bpm: 108, meter: 4, root: 57, scale: MIXO, chords: [0, 6, 3, 0, 0, 6, 4, 0],
    motif: [0, 2, 4, T, 2, T, 5, 4, 2, T, 0, 2, 4, T, T, R],
    lead: { type: "square", gain: 0.04, oct: 1, vib: 3, atk: 0.01, rel: 0.25, cutoff: 3600, echo: 0.3, layer: "triangle" },
    pad: { type: "triangle", gain: 0.028, cutoff: 1300, atk: 0.5 },
    bass: { style: "rootfifth", type: "triangle", gain: 0.1 },
    arp: { pattern: [0, 1, 2, 1, 2, 3, 2, 1], type: "triangle", gain: 0.03, oct: 2, len: 0.3 },
    drums: "march", drumGain: 0.4, swing: 0, reverb: 0.4,
  },
  // Mossgate Ruins: damp dorian, slow bass with woody lead
  moss: {
    bpm: 70, meter: 4, root: 49, scale: DORIAN, chords: [0, 3, 0, 5, 1, 3, 4, 0],
    motif: [0, R, T, 2, 3, T, R, R, 4, T, 3, R, 2, T, 0, R],
    lead: { type: "triangle", gain: 0.07, oct: 1, vib: 3, atk: 0.03, rel: 0.9, cutoff: 2200, echo: 0.5, layer: "sine" },
    pad: { type: "triangle", gain: 0.028, cutoff: 650, atk: 1.6 },
    bass: { style: "pulse", type: "sine", gain: 0.11 },
    arp: { pattern: [0, 2, 4, 2, R, 2, 3, R], type: "sine", gain: 0.04, oct: 2, len: 0.5 },
    drums: "heart", drumGain: 0.35, swing: 0.12, reverb: 0.8,
  },
  // Skyreach Spire: bright rising lydian with a ringing arpeggio
  spire: {
    bpm: 112, meter: 4, root: 58, scale: LYDIAN, chords: [0, 1, 4, 0, 5, 1, 4, 0],
    motif: [0, 2, 4, 6, T, 4, 2, T, 1, 3, 5, 7, T, 5, 3, R],
    lead: { type: "triangle", gain: 0.07, oct: 1, vib: 4, atk: 0.01, rel: 0.6, cutoff: 5200, echo: 0.55, layer: "square" },
    pad: { type: "sine", gain: 0.04, cutoff: 2000, atk: 0.8 },
    bass: { style: "oct", type: "triangle", gain: 0.09 },
    arp: { pattern: [0, 2, 4, 2, 0, 3, 5, 3], type: "sine", gain: 0.055, oct: 2, len: 0.35 },
    drums: "soft", drumGain: 0.4, swing: 0, reverb: 0.7,
  },
  // Bark Warden: heavy, rooted, slower than the Cistern boss
  bosswarden: {
    bpm: 132, meter: 4, root: 43, scale: DORIAN, chords: [0, 0, 3, 0, 5, 5, 4, 0],
    motif: [0, 0, R, 0, 2, R, 3, 0, R, 0, 4, R, 3, 2, 0, R],
    lead: { type: "sawtooth", gain: 0.05, oct: 1, vib: 4, atk: 0.004, rel: 0.15, cutoff: 2800, echo: 0.25, layer: "square" },
    pad: { type: "sawtooth", gain: 0.03, cutoff: 500, atk: 0.2 },
    bass: { style: "sync", type: "square", gain: 0.07 },
    arp: { pattern: [0, 0, 2, 0, 0, 3, 2, 0], type: "square", gain: 0.012, oct: 1, len: 0.25 },
    drums: "taiko", drumGain: 0.95, swing: 0, reverb: 0.35, seventh: true,
  },
  // Stormfinch Mol: fast, airy, driven by the arp
  bossstorm: {
    bpm: 168, meter: 4, root: 50, scale: MIXO, chords: [0, 6, 0, 3, 0, 6, 4, 4],
    motif: [4, 5, 4, R, 2, 4, 2, R, 6, 7, 6, R, 4, 2, 4, R],
    lead: { type: "sawtooth", gain: 0.045, oct: 1, vib: 6, atk: 0.003, rel: 0.1, cutoff: 4400, echo: 0.3, layer: "triangle" },
    pad: { type: "sawtooth", gain: 0.024, cutoff: 900, atk: 0.15 },
    bass: { style: "oct", type: "sawtooth", gain: 0.07 },
    arp: { pattern: [0, 2, 4, 2, 1, 3, 5, 3], type: "square", gain: 0.02, oct: 2, len: 0.2 },
    drums: "rock", drumGain: 0.95, swing: 0, reverb: 0.3,
  },
  // Crownwatch Keep: grave harmonic-minor march
  keep: {
    bpm: 84, meter: 4, root: 46, scale: HARM, chords: [0, 3, 5, 4, 0, 3, 6, 0],
    motif: [0, T, R, 2, 3, T, 2, R, 4, T, 3, 2, 0, T, T, R],
    lead: { type: "sawtooth", gain: 0.04, oct: 1, vib: 3, atk: 0.04, rel: 0.7, cutoff: 2000, echo: 0.5, layer: "triangle" },
    pad: { type: "sawtooth", gain: 0.03, cutoff: 600, atk: 1.2 },
    bass: { style: "pulse", type: "triangle", gain: 0.11 },
    drums: "march", drumGain: 0.5, swing: 0, reverb: 0.7,
  },
  // Vael Orsek: relentless
  finalboss: {
    bpm: 150, meter: 4, root: 44, scale: HARM, chords: [0, 5, 6, 0, 3, 5, 6, 4],
    motif: [0, 2, 3, R, 4, 3, 2, R, 6, 5, 4, 3, R, 2, 0, R],
    lead: { type: "sawtooth", gain: 0.055, oct: 1, vib: 7, atk: 0.003, rel: 0.12, cutoff: 4200, echo: 0.28, layer: "square" },
    pad: { type: "sawtooth", gain: 0.035, cutoff: 700, atk: 0.1 },
    bass: { style: "sync", type: "sawtooth", gain: 0.09 },
    arp: { pattern: [0, 1, 2, 3, 2, 1, 2, 0], type: "sawtooth", gain: 0.016, oct: 1, len: 0.25 },
    drums: "taiko", drumGain: 1, swing: 0, reverb: 0.4, seventh: true,
  },
  // Credits: warm, resolved major
  credits: {
    bpm: 84, meter: 4, root: 55, scale: MAJOR, chords: [0, 4, 5, 3, 0, 4, 3, 0],
    motif: [0, T, 2, 4, T, T, 5, 4, 2, T, 0, T, 1, 2, 0, R],
    lead: { type: "triangle", gain: 0.085, oct: 1, vib: 3, atk: 0.03, rel: 1.0, cutoff: 4500, echo: 0.55, layer: "sine" },
    pad: { type: "sawtooth", gain: 0.03, cutoff: 1400, atk: 0.8 },
    bass: { style: "rootfifth", type: "triangle", gain: 0.1 },
    arp: { pattern: [0, 2, 4, 2, 1, 3, 4, 3], type: "sine", gain: 0.04, oct: 2, len: 0.6 },
    drums: "soft", drumGain: 0.3, swing: 0.05, reverb: 0.75,
  },
  victory: {
    bpm: 128, meter: 4, root: 60, scale: MAJOR, chords: [0, 3, 4, 0, 3, 4, 0, 0],
    motif: [0, 2, 4, 7, T, T, 4, 7, 5, T, 4, 2, 4, T, T, R],
    lead: { type: "square", gain: 0.05, oct: 1, vib: 3, atk: 0.01, rel: 0.2, cutoff: 5000, echo: 0.25, layer: "sawtooth" },
    pad: { type: "sawtooth", gain: 0.025, cutoff: 1500, atk: 0.1 },
    bass: { style: "oct", type: "triangle", gain: 0.13 },
    arp: { pattern: [0, 1, 2, 3, 2, 1, 2, 3], type: "triangle", gain: 0.03, oct: 1, len: 0.4 },
    drums: "fanfare", drumGain: 0.7, swing: 0, reverb: 0.35,
  },
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function degMidi(spec: Spec, deg: number): number {
  const oct = Math.floor(deg / 7);
  const idx = ((deg % 7) + 7) % 7;
  return spec.root + spec.scale[idx] + 12 * oct;
}

interface Active {
  id: TrackId;
  spec: Spec;
  out: GainNode;
  echoIn: GainNode;
  step: number;
  next: number;
}

class Music {
  private active: Active | null = null;
  private want: TrackId | null = null;
  private timer = 0;
  private noise: AudioBuffer | null = null;
  private verb: ConvolverNode | null = null;
  private verbSend: GainNode | null = null;
  constructor(private host: Sfx) {}

  play(id: TrackId | null): void {
    this.want = id;
    this.apply();
  }

  /** Called when the audio context becomes available/running. */
  apply(): void {
    const ctx = this.host.ctxIfRunning();
    if (!ctx) return;
    if (this.active && this.active.id === this.want) return;
    const old = this.active;
    this.active = null;
    if (old) {
      old.out.gain.cancelScheduledValues(ctx.currentTime);
      old.out.gain.setValueAtTime(old.out.gain.value, ctx.currentTime);
      old.out.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.6);
      const out = old.out;
      setTimeout(() => out.disconnect(), 2200);
    }
    if (this.want) {
      this.ensureShared(ctx);
      const spec = SPECS[this.want];
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.gain.linearRampToValueAtTime(1, ctx.currentTime + (old ? 1.6 : 0.8));
      out.connect(this.host.musicBus());
      const echoIn = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = (60 / spec.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      echoIn.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(out);
      this.active = { id: this.want, spec, out, echoIn, step: 0, next: ctx.currentTime + 0.1 };
    }
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 40);
  }

  private ensureShared(ctx: AudioContext): void {
    if (this.noise) return;
    const n = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 1;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.host.musicBus());
  }

  private tick(): void {
    const ctx = this.host.ctxIfRunning();
    const a = this.active;
    if (!ctx || !a) return;
    const spec = a.spec;
    const stepDur = 60 / spec.bpm / 2;
    const spb = spec.meter * 2;
    if (a.next < ctx.currentTime - 0.2) a.next = ctx.currentTime + 0.05; // tab was asleep or muted for a while
    while (a.next < ctx.currentTime + 0.3) {
      const swung = a.step % 2 === 1 ? stepDur * spec.swing : 0;
      if (!this.host.muted) this.schedule(ctx, a, a.step, a.next + swung, stepDur);
      a.next += stepDur;
      a.step += 1;
      if (a.step >= spb * 8) a.step = 0;
    }
  }

  private schedule(ctx: AudioContext, a: Active, step: number, t: number, sd: number): void {
    const spec = a.spec;
    const spb = spec.meter * 2;
    const bar = Math.floor(step / spb);
    const j = step % spb;
    const chordDeg = spec.chords[bar];
    const tones = [chordDeg, chordDeg + 2, chordDeg + 4, chordDeg + 7];
    if (spec.seventh) tones[3] = chordDeg + 6;
    const barDur = sd * spb;

    // pad
    if (spec.pad && j === 0) {
      for (const d of tones.slice(0, 3)) {
        const f = midiHz(degMidi(spec, d));
        this.voice(ctx, a, f, t, barDur * 1.02, { type: spec.pad.type, gain: spec.pad.gain, atk: spec.pad.atk, rel: 0.9, cutoff: spec.pad.cutoff, detune: [-7, 7], rev: spec.reverb * 0.7, echo: 0 });
      }
    }
    // bass
    if (spec.bass) this.bass(ctx, a, spec, tones, j, t, sd, spb, barDur);
    // arp
    if (spec.arp) {
      const idx = spec.arp.pattern[j % spec.arp.pattern.length];
      if (idx !== R) {
        const d = tones[idx % 4] + (idx >= 3 ? 0 : 0);
        const f = midiHz(degMidi(spec, d) + 12 * spec.arp.oct);
        this.voice(ctx, a, f, t, sd * spec.arp.len, { type: spec.arp.type, gain: spec.arp.gain, atk: 0.004, rel: sd * spec.arp.len * 0.8, cutoff: 3800, rev: spec.reverb, echo: spec.lead.echo * 0.6 });
      }
    }
    // lead
    this.leadStep(ctx, a, spec, bar, j, t, sd, spb);
    // drums
    if (spec.drums !== "none") this.drums(ctx, a, spec, j, t, bar);
  }

  private leadStep(ctx: AudioContext, a: Active, spec: Spec, bar: number, j: number, t: number, sd: number, spb: number): void {
    const m = spec.motif;
    const sec = Math.floor(bar / 2);
    const inPhrase = (bar % 2) * spb + j;
    let slot = inPhrase;
    if (sec === 2) slot = (m.length - 1 - inPhrase + m.length * 4) % m.length; // answer: the motif reversed
    const v = m[slot % m.length];
    if (v === R || v === T) return;
    let deg = v;
    if (sec === 1) deg += spec.chords[bar] - spec.chords[0];
    if (sec === 3 && bar === 7 && j >= spb - 3) deg = [0, -1, 0][j - (spb - 3)] + 0; // cadence home
    // length: count following ties
    let len = 1;
    for (let k = 1; k < 8; k++) {
      const nxt = m[(slot + (sec === 2 ? -k : k) + m.length * 8) % m.length];
      if (nxt === T) len++;
      else break;
    }
    const dur = sd * len;
    const f = midiHz(degMidi(spec, deg) + 12 * spec.lead.oct);
    const L = spec.lead;
    this.voice(ctx, a, f, t, dur * 0.95, { type: L.type, gain: L.gain, atk: L.atk, rel: L.rel, cutoff: L.cutoff, vib: L.vib, rev: spec.reverb, echo: L.echo });
    if (L.layer) this.voice(ctx, a, f * 2, t, dur * 0.9, { type: L.layer, gain: L.gain * 0.35, atk: L.atk, rel: L.rel * 0.8, cutoff: L.cutoff, rev: spec.reverb, echo: L.echo * 0.5 });
  }

  private bass(ctx: AudioContext, a: Active, spec: Spec, tones: number[], j: number, t: number, sd: number, spb: number, barDur: number): void {
    const b = spec.bass!;
    const root = degMidi(spec, tones[0]) - 24;
    const fifth = degMidi(spec, tones[2]) - 24;
    const play = (m: number, len: number, g = 1) => this.voice(ctx, a, midiHz(m), t, len, { type: b.type, gain: b.gain * g, atk: 0.006, rel: len * 0.6, cutoff: 700, rev: 0, echo: 0 });
    switch (b.style) {
      case "root": if (j % 2 === 0) play(root, sd * 1.8); break;
      case "rootfifth": if (j % 2 === 0) play(Math.floor(j / 2) % 2 === 0 ? root : fifth, sd * 1.8); break;
      case "pulse": play(root, sd * 0.8, j % 2 === 0 ? 1 : 0.7); break;
      case "oct": play(j % 2 === 0 ? root : root + 12, sd * 0.9); break;
      case "sync": if ([0, 3, 6, 7].includes(j % 8) || (spb > 8 && j % 8 === 4)) play(root, sd * 0.9); break;
      case "drone": if (j === 0) play(root, barDur * 1.02); break;
      case "oompah": if (j === 0) play(root, sd * 1.8); else if (j % 2 === 0) play(fifth, sd * 1.4, 0.7); break;
      default: break;
    }
  }

  private drums(ctx: AudioContext, a: Active, spec: Spec, j: number, t: number, bar: number): void {
    const g = spec.drumGain;
    const kick = (v = 1) => this.kick(ctx, a, t, g * v);
    const snare = (v = 1) => this.snare(ctx, a, t, g * v);
    const hat = (v = 1, open = false) => this.hat(ctx, a, t, g * v, open);
    const tom = (f: number, v = 1) => this.tom(ctx, a, t, g * v, f);
    const meter = spec.meter;
    switch (spec.drums) {
      case "soft": if (j % 4 === 0) kick(0.5); if (j % 2 === 1) hat(0.3); break;
      case "march": if (j % 4 === 0) kick(0.8); if (j % 4 === 2) snare(0.5); if (j % 2 === 1) hat(0.25); break;
      case "waltz": if (j === 0) kick(0.7); if (j === 2 || j === 4) hat(0.5); break;
      case "rock": if (j % 8 === 0 || j === 5) kick(); if (j % 8 === 4) snare(); hat(j % 2 === 0 ? 0.4 : 0.22, j % 8 === 7); break;
      case "tribal": if (j % 8 === 0 || j % 8 === 3) tom(110, 0.9); if (j % 8 === 4 || j % 8 === 6) tom(160, 0.6); if (j % 2 === 1) hat(0.18); break;
      case "heart": if (j === 0) tom(60, 1); if (j === 2) tom(52, 0.7); break;
      case "taiko": if (j % 8 === 0) tom(70, 1); if (j % 8 === 6 && bar % 2 === 1) tom(90, 0.7); if (meter === 4 && j % 8 === 4) tom(120, 0.4); if (j % 2 === 0 && bar >= 4) hat(0.18); break;
      case "fanfare": if (j % 4 === 0) kick(0.9); if (j % 4 === 2) snare(0.8); if (j % 2 === 1) hat(0.3); if (j === 7 && bar % 2 === 1) tom(150, 0.8); break;
      default: break;
    }
  }

  private kick(ctx: AudioContext, a: Active, t: number, g: number): void {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    e.gain.setValueAtTime(0.26 * g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(e);
    e.connect(a.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  private tom(ctx: AudioContext, a: Active, t: number, g: number, f: number): void {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    e.gain.setValueAtTime(0.24 * g, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(e);
    e.connect(a.out);
    if (this.verbSend) {
      const s = ctx.createGain();
      s.gain.value = 0.35 * a.spec.reverb;
      e.connect(s);
      s.connect(this.verbSend);
    }
    o.start(t);
    o.stop(t + 0.5);
  }

  private noiseHit(ctx: AudioContext, a: Active, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number): void {
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const e = ctx.createGain();
    e.gain.setValueAtTime(gain, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(e);
    e.connect(a.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private snare(ctx: AudioContext, a: Active, t: number, g: number): void {
    this.noiseHit(ctx, a, t, 0.16, 0.16 * g, "bandpass", 1800);
    this.tom(ctx, a, t, g * 0.4, 190);
  }

  private hat(ctx: AudioContext, a: Active, t: number, g: number, open: boolean): void {
    this.noiseHit(ctx, a, t, open ? 0.2 : 0.05, 0.07 * g, "highpass", 7000);
  }

  private voice(
    ctx: AudioContext,
    a: Active,
    freq: number,
    t: number,
    dur: number,
    o: { type: Wave; gain: number; atk: number; rel: number; cutoff: number; detune?: number[]; vib?: number; rev: number; echo: number },
  ): void {
    const amp = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 0.7;
    filt.frequency.setValueAtTime(Math.min(o.cutoff, 12000), t);
    const hold = Math.max(0.03, dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(o.gain, t + Math.max(0.003, o.atk));
    amp.gain.setValueAtTime(o.gain, t + Math.max(o.atk, hold - 0.01));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + hold + o.rel);
    const dets = o.detune ?? [0];
    const end = t + hold + o.rel + 0.05;
    for (const dt of dets) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = freq;
      osc.detune.value = dt;
      if (o.vib) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = o.vib + 0.7;
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(freq * 0.006, t + 0.3);
        lfo.connect(lg);
        lg.connect(osc.frequency);
        lfo.start(t);
        lfo.stop(end);
      }
      osc.connect(filt);
      osc.start(t);
      osc.stop(end);
    }
    filt.connect(amp);
    amp.connect(a.out);
    if (o.echo > 0) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      amp.connect(s);
      s.connect(a.echoIn);
    }
    if (o.rev > 0 && this.verbSend) {
      const s = ctx.createGain();
      s.gain.value = o.rev * 0.8;
      amp.connect(s);
      s.connect(this.verbSend);
    }
  }
}

export class Sfx {
  get muted(): boolean {
    return settings.muted;
  }
  get volume(): number {
    return settings.master;
  }
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musGain: GainNode | null = null;
  private duckLevel = 1;
  private duckTimer = 0;
  private readonly music = new Music(this);

  constructor() {
    settingsStore.subscribe(() => this.applyLevels());
    if (typeof window !== "undefined") {
      const gesture = () => this.unlock();
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, gesture, { passive: true });
      window.addEventListener("keydown", (e) => {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
        if (e.key === "-" || e.key === "_") this.setVolume(this.volume - 0.1);
        else if (e.key === "=" || e.key === "+") this.setVolume(this.volume + 0.1);
      });
    }
  }

  /** Called on user gestures; creates/resumes the audio context and starts waiting music. */
  unlock(): void {
    try {
      const ctx = this.context();
      if (ctx.state === "suspended") void ctx.resume().then(() => this.music.apply());
      else this.music.apply();
    } catch {
      // The chronicle still runs with the sound off.
    }
  }

  toggle(): void {
    settingsStore.update({ muted: !settings.muted });
  }

  setVolume(v: number): void {
    settingsStore.update({ master: Math.max(0, Math.min(1, Math.round(v * 10) / 10)) });
  }

  /** Lower the music for dialogue or big effects; level 1 restores it. */
  duck(level: number, holdMs = 0): void {
    if (holdMs === 0 && level === this.duckLevel) return;
    window.clearTimeout(this.duckTimer);
    this.duckLevel = level;
    this.applyLevels();
    if (holdMs > 0 && level < 1) this.duckTimer = window.setTimeout(() => this.duck(1), holdMs);
  }

  setTheme(theme: TrackId | null): void {
    this.music.play(theme);
  }

  /** Kept for the scenes' update loops; the music scheduler runs on its own timer. */
  pulse(_dt: number): void {
    // no-op
  }

  ctxIfRunning(): AudioContext | null {
    return this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  musicBus(): GainNode {
    this.context();
    return this.musGain!;
  }

  /** Bus for sound effects (used by the effect synths). */
  sfxBus(): GainNode {
    this.context();
    return this.sfxGain!;
  }

  context(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musGain = ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musGain.connect(this.master);
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.ctx = ctx;
      this.applyLevels(true);
    }
    return this.ctx;
  }

  private applyLevels(instant = false): void {
    if (!this.ctx || !this.master || !this.musGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const m = this.muted ? 0 : this.volume;
    const tc = instant ? 0.001 : 0.08;
    this.master.gain.setTargetAtTime(m, now, tc);
    this.musGain.gain.setTargetAtTime(0.55 * settings.music * this.duckLevel, now, this.duckLevel < 1 ? 0.05 : 0.45);
    this.sfxGain.gain.setTargetAtTime(settings.sfx, now, 0.05);
  }

  /** Plays one of the sim's named sound effects. */
  play(name: SfxName): void {
    const t = (f: number, d: number, ty: OscillatorType, g = 0.03, dl = 0) => this.tone(f, d, ty, g, dl);
    const seq = (fs: number[], d: number, ty: OscillatorType, g: number, gap: number) => fs.forEach((f, i) => t(f, d, ty, g, i * gap));
    switch (name) {
      case "swing": t(300, 0.07, "sawtooth", 0.016); t(220, 0.08, "triangle", 0.014, 0.03); break;
      case "spin": seq([260, 330, 420, 520], 0.08, "sawtooth", 0.02, 0.04); break;
      case "charge": t(440, 0.1, "sine", 0.012); break;
      case "hit": t(170, 0.08, "sawtooth", 0.03); break;
      case "kill": seq([300, 200, 120], 0.1, "square", 0.025, 0.05); break;
      case "hurt": t(150, 0.2, "sawtooth", 0.04); t(110, 0.25, "square", 0.03, 0.05); break;
      case "block": t(600, 0.05, "square", 0.025); t(900, 0.05, "triangle", 0.02, 0.02); break;
      case "clang": t(1100, 0.12, "square", 0.02); t(740, 0.18, "triangle", 0.02, 0.02); break;
      case "roll": t(200, 0.12, "triangle", 0.02); t(150, 0.12, "triangle", 0.015, 0.06); break;
      case "hop": t(380, 0.08, "triangle", 0.02); break;
      case "land": t(120, 0.08, "sine", 0.03); break;
      case "pickup": seq([660, 880], 0.08, "triangle", 0.025, 0.05); break;
      case "glint": seq([1040, 1320], 0.06, "triangle", 0.02, 0.04); break;
      case "heart": seq([520, 780], 0.1, "triangle", 0.03, 0.06); break;
      case "chest": seq([392, 523, 659], 0.12, "triangle", 0.03, 0.07); break;
      case "bigchest": seq([392, 494, 587, 784, 988], 0.16, "triangle", 0.035, 0.09); break;
      case "key": seq([880, 1175, 1480], 0.08, "square", 0.02, 0.05); break;
      case "unlock": t(300, 0.06, "square", 0.025); t(600, 0.1, "square", 0.025, 0.07); break;
      case "door": t(180, 0.15, "triangle", 0.03); break;
      case "shutter": t(110, 0.4, "sawtooth", 0.04); t(90, 0.4, "square", 0.02, 0.1); break;
      case "switch": t(520, 0.06, "square", 0.025); t(780, 0.1, "square", 0.025, 0.06); break;
      case "arrow": t(900, 0.05, "triangle", 0.03); t(520, 0.09, "sawtooth", 0.018, 0.03); break;
      case "burn": t(180, 0.3, "sawtooth", 0.03); t(320, 0.25, "square", 0.015, 0.05); t(520, 0.2, "triangle", 0.012, 0.1); break;
      case "gust": t(140, 0.5, "sawtooth", 0.02); t(220, 0.5, "triangle", 0.015, 0.1); break;
      case "disc": seq([700, 560, 460], 0.1, "sine", 0.03, 0.05); break;
      case "fire": t(240, 0.12, "sawtooth", 0.025); break;
      case "blip": t(880, 0.04, "square", 0.015); t(1175, 0.04, "square", 0.012, 0.04); break;
      case "select": t(660, 0.05, "square", 0.018); break;
      case "buy": seq([880, 1100, 1320], 0.06, "triangle", 0.025, 0.05); break;
      case "deny": t(180, 0.12, "square", 0.025); break;
      case "fall": seq([400, 300, 200, 100], 0.12, "sine", 0.03, 0.08); break;
      case "bush": t(520, 0.06, "sawtooth", 0.012); break;
      case "splash": t(300, 0.1, "sine", 0.02); t(200, 0.12, "sine", 0.02, 0.05); break;
      case "boss": seq([110, 104, 98], 0.5, "sawtooth", 0.035, 0.2); break;
      case "fanfare": seq([523, 659, 784, 1046, 784, 1046], 0.16, "square", 0.025, 0.1); break;
      case "stairs": seq([300, 340, 380], 0.08, "triangle", 0.02, 0.07); break;
      case "death": seq([300, 240, 180, 120], 0.2, "sawtooth", 0.035, 0.15); break;
      case "save": seq([660, 880], 0.08, "sine", 0.02, 0.08); break;
      case "quest": seq([523, 659, 784], 0.12, "triangle", 0.03, 0.08); break;
      case "lift": t(110, 0.25, "sawtooth", 0.03); t(160, 0.2, "square", 0.02, 0.08); t(260, 0.15, "triangle", 0.02, 0.2); break;
      case "dash": t(180, 0.18, "sawtooth", 0.02); t(420, 0.2, "triangle", 0.016, 0.03); t(700, 0.18, "sine", 0.012, 0.08); break;
      case "crumble": t(90, 0.3, "sawtooth", 0.04); t(140, 0.25, "square", 0.03, 0.04); t(70, 0.35, "sine", 0.04, 0.1); break;
      case "levelup": // a rising chime: bright arpeggio over a soft octave pad, then a sparkle tail
        seq([523, 659, 784, 1046, 1319, 1568], 0.26, "triangle", 0.03, 0.075);
        seq([262, 330, 392, 523, 659, 784], 0.34, "sine", 0.026, 0.075);
        seq([2093, 2637, 3136, 2637, 3136, 4186], 0.12, "sine", 0.01, 0.06);
        t(1568, 0.7, "sine", 0.02, 0.5);
        break;
    }
  }

  /** Simple enveloped oscillator on the effects bus. Public so effect synths can reuse it. */
  tone(freq: number, dur: number, type: OscillatorType, gain = 0.03, delay = 0): void {
    if (this.muted || !this.ctxIfRunning()) return;
    try {
      const ctx = this.context();
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(amp);
      amp.connect(this.sfxBus());
      osc.start(start);
      osc.stop(start + dur + 0.02);
    } catch {
      // Autoplay rules and missing devices should not stop play.
    }
  }
}

export const sfx = new Sfx();
