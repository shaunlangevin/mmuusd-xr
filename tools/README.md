# Model prep tools (for Claude or a developer)

Not used by the website. They prepare a museum scan for the viewer.

- `bake.mjs`: flattens node transforms into the mesh, turns it, centres it, puts the base at y = 0 and scales it to the real height. Keeps textures as they are.
  `npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions three`, then
  `node tools/bake.mjs in.glb out.glb <turn degrees around Y> <height in metres>`
  Example (Rosetta Stone, carved face pointed +X in the scan): `node tools/bake.mjs rosetta.glb exhibits/rosetta-stone/model.glb -90 1.123`
- `to_usdz.py`: makes the iPad / AR Quick Look copy.
  `pip install usd-core trimesh pillow numpy`, then
  `python3 tools/to_usdz.py model.glb model.usdz <work folder> <height in metres>`
- `recording_scripts.py`: rebuilds an exhibit's `RECORDING-SCRIPT.md` and `EXTRA-RECORDING-SCRIPT.md` from its `exhibit.json`, so the scripts always match the panels.
  `python3 tools/recording_scripts.py rosetta-stone`
  Run it after changing any panel text, and re-record the clips whose words changed.
- `package.py`: builds a site-update zip for GitHub. `python3 tools/package.py <label> [extra files]`
