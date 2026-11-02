# Convert the exhibit GLB into a USDZ for iPad/iPhone AR Quick Look (JPEG textures, metres, Y-up, base at y=0)
import sys, io, os, numpy as np, trimesh
from PIL import Image
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt, UsdUtils
src, out, work = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(work, exist_ok=True); os.chdir(work)
scene = trimesh.load(src)
HEIGHT = float(sys.argv[4]) if len(sys.argv) > 4 else None
all_b = scene.bounds; K = (HEIGHT / (all_b[1][1] - all_b[0][1])) if HEIGHT else 1.0
stage = Usd.Stage.CreateNew('model.usda')
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y); UsdGeom.SetStageMetersPerUnit(stage, 1.0)
root = UsdGeom.Xform.Define(stage, '/Stele'); stage.SetDefaultPrim(root.GetPrim())
n = 0
for node in scene.graph.nodes_geometry:
    T, gname = scene.graph[node]
    g = scene.geometry[gname].copy(); g.apply_transform(T); g.apply_scale(K)
    n += 1; path = f'/Stele/Mesh{n}'
    mesh = UsdGeom.Mesh.Define(stage, path)
    mesh.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(g.vertices.astype(np.float32)))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(g.faces)))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(g.faces.astype(np.int32).ravel()))
    mesh.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(g.vertex_normals.astype(np.float32))); mesh.SetNormalsInterpolation('vertex')
    mesh.CreateSubdivisionSchemeAttr('none')
    mat = UsdShade.Material.Define(stage, f'/Stele/Mat{n}')
    sh = UsdShade.Shader.Define(stage, f'/Stele/Mat{n}/PBR'); sh.CreateIdAttr('UsdPreviewSurface')
    sh.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(0.8); sh.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(0.0)
    vis = g.visual
    if isinstance(vis, trimesh.visual.TextureVisuals) and vis.uv is not None and getattr(vis.material, 'baseColorTexture', None) is not None:
        st = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar('st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        st.Set(Vt.Vec2fArray.FromNumpy(vis.uv.astype(np.float32)))   # trimesh already flips V (= USD convention)
        reader = UsdShade.Shader.Define(stage, f'/Stele/Mat{n}/stReader'); reader.CreateIdAttr('UsdPrimvarReader_float2')
        reader.CreateInput('varname', Sdf.ValueTypeNames.Token).Set('st')
        def tex(name, img, size, out_name, channels='rgb', normal=False):
            img = img.convert('RGB').resize((size, size), Image.LANCZOS); img.save(name, quality=85)
            t = UsdShade.Shader.Define(stage, f'/Stele/Mat{n}/{out_name}Tex'); t.CreateIdAttr('UsdUVTexture')
            t.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(name)
            t.CreateInput('st', Sdf.ValueTypeNames.Float2).ConnectToSource(reader.ConnectableAPI(), 'result')
            t.CreateInput('wrapS', Sdf.ValueTypeNames.Token).Set('repeat'); t.CreateInput('wrapT', Sdf.ValueTypeNames.Token).Set('repeat')
            if normal:
                t.CreateInput('scale', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(2, 2, 2, 1)); t.CreateInput('bias', Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(-1, -1, -1, 0))
                t.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('raw')
            elif channels == 'r':
                t.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('raw')
            else:
                t.CreateInput('sourceColorSpace', Sdf.ValueTypeNames.Token).Set('sRGB')
            return t
        m = vis.material
        tb = tex('color.jpg', m.baseColorTexture, 2048, 'color')
        sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).ConnectToSource(tb.ConnectableAPI(), 'rgb')
        if getattr(m, 'normalTexture', None) is not None:
            tn = tex('normal.jpg', m.normalTexture, 1024, 'normal', normal=True)
            tn.CreateOutput('rgb', Sdf.ValueTypeNames.Float3)
            sh.CreateInput('normal', Sdf.ValueTypeNames.Normal3f).ConnectToSource(tn.ConnectableAPI(), 'rgb')
        tb.CreateOutput('rgb', Sdf.ValueTypeNames.Float3)
    else:
        sh.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.09, 0.085, 0.08))
    mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), 'surface')
    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(mat)
stage.GetRootLayer().Save()
ok = UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath('model.usda'), out)
bb = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default']).ComputeWorldBound(stage.GetPrimAtPath('/Stele')).GetRange()
print('ok', ok, 'meshes', n, 'bbox', bb.GetMin(), bb.GetMax(), 'size MB', round(os.path.getsize(out)/1e6, 1))
