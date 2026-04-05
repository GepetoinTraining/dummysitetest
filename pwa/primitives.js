// ============================================================
// 3D Primitives — pre-baked vertex buffers + draw loop
//
// WebGL direct. No Three.js. No scene graph.
// The worker tells us what to draw. We draw it.
//
// TODO: implement when we build the 3D workspace locally.
// For now, this is the mount point.
// ============================================================

window.drawScene = function(sceneData) {
  // sceneData = { nodes: [...], edges: [...], camera: {...} }
  // Will be implemented with raw WebGL + pre-baked vertex buffers
  console.log('3D scene requested:', sceneData);
};
