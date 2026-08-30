# Audio assets

This directory is where real audio files eventually land. The architecture that reads from here
(`src/audio/`) is built without adding any placeholder sound — see `AUDIO_ASSET_MAP`,
`MUSIC_TRACKS` and `AMBIENT_LAYER_DEFS` in `src/audio/assets.ts`, every one of which currently lists
`variations: []`. An empty list is the documented "not recorded yet" state (`AudioManager` treats it
as "no asset for this event," never an error), not a placeholder.

## Layout

Organised by semantic category, not by the individual gameplay system that plays a sound — see
CLAUDE.md "Audio Asset Architecture":

```
audio/
  music/          one loop per VillageTier (settlement/hamlet/village/town/city) —
                  more than one file per tier is fine (`AudioManager` picks a track and
                  avoids an immediate repeat, see `pickMusicVariation`)
  ambient/        water/wind/forest/village loops, driven by `AudioManager.updateEnvironment`
                  (`src/audio/environment.ts`); bird calls too, but as one-shot files
                  (`BIRD_CALL` in `AUDIO_ASSET_MAP`) fired occasionally on a randomized
                  schedule (`src/audio/birds.ts`) — not a loop, however many you drop in
  buildings/      construction started/completed/damaged/repaired, and the four building/
                  activity sounds (mining/woodcutting/blacksmith/construction) — intermittent
                  one-shots scheduled off live worker counts (`src/audio/activity.ts`), never
                  a loop and never one file per worker
  events/         disaster stings (fire/flood/famine/sickness/warning), tier-advance sting
  merchants/      boat sailing in, arrival/bell, trade completed
  achievements/   achievement-earned sting
  ui/             building placed, invalid action, button confirm/error
```

`src/audio/assets.ts`'s `AudioAssetDef.dir` field on every entry names the folder that event's files
belong in — that table is the single source of truth for "which folder", not this README.

## Adding a sound

1. Drop the file(s) in the matching folder above. Multiple variations of the same event
   (`woodcut_01.mp3`, `woodcut_02.mp3`, …) are picked at random on each play — see CLAUDE.md
   "Support Variations" — so a repeated action doesn't sound identical every time.
2. List the filename(s) in that event's `variations` array in `src/audio/assets.ts`. Nothing else
   changes: `AudioManager` starts loading and playing it the moment `variations` is non-empty.
3. Formats: whatever `AudioContext.decodeAudioData` accepts in the target browsers (mp3/ogg/wav all
   work). Keep files small — they're fetched over the network on first play and cached in memory
   afterwards (see `AudioManager.resolveBuffer`), not bundled into the app.
