import {
  AttributeType,
  gl,
  IEncodeFeature,
  IModel,
  ITexture2D,
} from '@antv/l7-core';
import { rgb2arr } from '@antv/l7-utils';
import BaseModel from '../../core/BaseModel';
import { IPolygonLayerStyleOptions } from '../../core/interface';
import { PolygonExtrudeTriangulation } from '../../core/triangulation';
import polygonExtrudeFrag from '../shaders/extrude/polygon_extrude_frag.glsl';
import polygonExtrudeVert from '../shaders/extrude/polygon_extrude_vert.glsl';
// extrude
import polygonExtrudeTexFrag from '../shaders/extrude/polygon_extrudetex_frag.glsl';
// texture
import polygonExtrudeTexVert from '../shaders/extrude/polygon_extrudetex_vert.glsl';
// extrude picking

import polygonExtrudePickLightFrag from '../shaders/extrude/polygon_extrude_picklight_frag.glsl';
import polygonExtrudePickLightVert from '../shaders/extrude/polygon_extrude_picklight_vert.glsl';
import { ShaderLocation } from '../../core/CommonStyleAttribute';

export default class ExtrudeModel extends BaseModel {
  protected texture: ITexture2D;
  public getUninforms() {
    const commoninfo = this.getCommonUniformsInfo();
    const attributeInfo = this.getUniformsBufferInfo(this.getStyleAttribute());
    this.updateStyleUnifoms();
    return {
      ...commoninfo.uniformsOption,
      ...attributeInfo.uniformsOption,
    }
  }
  protected getCommonUniformsInfo(): { uniformsArray: number[]; uniformsLength: number; uniformsOption: { [key: string]: any; }; } {
    const {
      heightfixed = false,
      raisingHeight = 0,
      topsurface = true,
      sidesurface = true,
      sourceColor,
      targetColor,
    } = this.layer.getLayerConfig() as IPolygonLayerStyleOptions;

    // 转化渐变色
    let useLinearColor = 0; // 默认不生效
    let sourceColorArr = [1, 1, 1, 1];
    let targetColorArr = [1, 1, 1, 1];
    if (sourceColor && targetColor) {
      sourceColorArr = rgb2arr(sourceColor);
      targetColorArr = rgb2arr(targetColor);
      useLinearColor = 1;
    }
    const commonOptions = {

      u_sourceColor: sourceColorArr,
      u_targetColor: targetColorArr,
      u_linearColor: useLinearColor,
      // 控制侧面和顶面的显示隐藏
      u_topsurface: Number(topsurface),
      u_sidesurface: Number(sidesurface),
      u_heightfixed: Number(heightfixed),
      u_raisingHeight: Number(raisingHeight),

      // 渐变色支持参数
      u_texture: this.texture,// 纹理
    };
    if(this.texture){
      this.textures =[this.texture]
    }
    const commonBufferInfo = this.getUniformsBufferInfo(commonOptions);
    return commonBufferInfo;

  }

  public async initModels(): Promise<IModel[]> {
    await this.loadTexture();
    return this.buildModels();
  }

  public async buildModels(): Promise<IModel[]> {
    const { frag, vert, type } = this.getShaders();
    this.initUniformsBuffer();
    const model = await this.layer.buildLayerModel({
      moduleName: type,
      vertexShader: vert,
      fragmentShader: frag,
      depth: { enable: true },
      inject: this.getInject(),
      triangulation: PolygonExtrudeTriangulation,
    });
    return [model];
  }

  public getShaders() {
    const { pickLight, mapTexture } =
      this.layer.getLayerConfig() as IPolygonLayerStyleOptions;
    if (mapTexture) {
      return {
        frag: polygonExtrudeTexFrag,
        vert: polygonExtrudeTexVert,
        type: 'polygonExtrudeTexture',
      };
    }
    if (pickLight) {
      return {
        frag: polygonExtrudePickLightFrag,
        vert: polygonExtrudePickLightVert,
        type: 'polygonExtrudePickLight',
      };
    } else {
      return {
        frag: polygonExtrudeFrag,
        vert: polygonExtrudeVert,
        type: 'polygonExtrude',
      };
    }
  }

  public clearModels() {
    this.texture?.destroy();
    this.textures = [];
  }

  protected registerBuiltinAttributes() {
    const bbox = this.layer.getSource().extent;
    let bounds = bbox;
    const layerCenter = this.layer.coordCenter || this.layer.getSource().center;
    let lngLen = bounds[2] - bounds[0];
    let latLen = bounds[3] - bounds[1];

    if (this.mapService.version === 'GAODE2.x') {
      // @ts-ignore
      const [minX, minY] = this.mapService.coordToAMap2RelativeCoordinates(
        [bbox[0], bbox[1]],
        layerCenter,
      );
      // @ts-ignore
      const [maxX, maxY] = this.mapService.coordToAMap2RelativeCoordinates(
        [bbox[2], bbox[3]],
        layerCenter,
      );
      lngLen = maxX - minX;
      latLen = maxY - minY;
      bounds = [minX, minY, maxX, maxY];
    }

    this.styleAttributeService.registerStyleAttribute({
      name: 'uvs',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_uvs',
        shaderLocation: ShaderLocation.UV,
        buffer: {
          // give the WebGL driver a hint that this buffer may change
          usage: gl.STATIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 3,
        update: (
          feature: IEncodeFeature,
          featureIdx: number,
          vertex: number[],
        ) => {
          const lng = vertex[0];
          const lat = vertex[1];
          // console.log((lng - bounds[0]) / lngLen, (lat - bounds[1]) / latLen, vertex[4])
          // 临时 兼容高德V2
          return [
            (lng - bounds[0]) / lngLen,
            (lat - bounds[1]) / latLen,
            vertex[4],
          ];
        },
      },
    });
    this.styleAttributeService.registerStyleAttribute({
      name: 'normal',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_Normal',
        shaderLocation: ShaderLocation.NORMAL,
        buffer: {
          // give the WebGL driver a hint that this buffer may change
          usage: gl.STATIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 3,
        update: (
          feature: IEncodeFeature,
          featureIdx: number,
          vertex: number[],
          attributeIdx: number,
          normal: number[],
        ) => {
          return normal;
        },
      },
    });

    this.styleAttributeService.registerStyleAttribute({
      name: 'size',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_Size',
        shaderLocation: ShaderLocation.SIZE,
        buffer: {
          usage: gl.DYNAMIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 1,
        update: (feature: IEncodeFeature) => {
          const { size = 10 } = feature;
          return Array.isArray(size) ? [size[0]] : [size as number];
        },
      },
    });
  }

  private async loadTexture() {
    const { mapTexture } =
      this.layer.getLayerConfig() as IPolygonLayerStyleOptions;

    const { createTexture2D } = this.rendererService;
    this.texture = createTexture2D({
      height: 0,
      width: 0,
    });
    if (mapTexture) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = mapTexture;

        image.onload = () => {
          this.texture = createTexture2D({
            data: image,
            width: image.width,
            height: image.height,
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            min: gl.LINEAR,
            mag: gl.LINEAR,
          });
          return resolve(null);
          // this.layerService.reRender();
        };

        image.onerror = () => {
          reject(new Error('image load error'));
        };
      });
    }
  }
}
