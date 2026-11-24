// Paths are relative to dist/. List dependencies before the packages that extend them.
globalThis.GrowthPackageDefaults = Object.freeze({ control: 'stronghold-control@1.0.0', experiment: 'stronghold-experiment@1.0.0' });
globalThis.GrowthPackageManifest = [
  { kind: 'pool', key: 'stronghold-java@1.17.1', src: 'pools/stronghold-java/1.17.1.js' },
  { kind: 'pool', key: 'stronghold-large-rooms@1.0.0', src: 'pools/stronghold-large-rooms/1.0.0.js' },
  { kind: 'ruleset', key: 'stronghold-java@1.17.1', src: 'rulesets/stronghold-java/1.17.1.js' },
  { kind: 'ruleset', key: 'stronghold-experiment@1.0.0', src: 'rulesets/stronghold-experiment/1.0.0.js' },
  { kind: 'ruleset', key: 'stronghold-room-count@1.0.0', src: 'rulesets/stronghold-room-count/1.0.0.js' },
  { kind: 'preset', key: 'stronghold-control@1.0.0', src: 'presets/stronghold/control.js' },
  { kind: 'preset', key: 'stronghold-experiment@1.0.0', src: 'presets/stronghold/experiment.js' },
  { kind: 'preset', key: 'stronghold-large-rooms@1.0.0', src: 'presets/stronghold/large-rooms.js' },
];
