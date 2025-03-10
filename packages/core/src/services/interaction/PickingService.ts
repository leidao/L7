import { decodePickingColor, DOM } from '@antv/l7-utils';
import { inject, injectable } from 'inversify';
import 'reflect-metadata';
import { TYPES } from '../../types';
import { isEventCrash } from '../../utils/dom';
import { IGlobalConfigService } from '../config/IConfigService';
import {
  IInteractionService,
  IInteractionTarget,
  InteractionEvent,
} from '../interaction/IInteractionService';
import { ILayer, ILayerService } from '../layer/ILayerService';
import { ILngLat, IMapService } from '../map/IMapService';
import { gl } from '../renderer/gl';
import { IFramebuffer } from '../renderer/IFramebuffer';
import { IRendererService } from '../renderer/IRendererService';
import { TextureUsage } from '../renderer/ITexture2D';
import { IPickingService } from './IPickingService';
@injectable()
export default class PickingService implements IPickingService {
  public pickedColors: Uint8Array | undefined;
  public pickedTileLayers: ILayer[] = [];
  @inject(TYPES.IMapService)
  private readonly mapService: IMapService;

  @inject(TYPES.IRendererService)
  private rendererService: IRendererService;

  @inject(TYPES.IGlobalConfigService)
  private readonly configService: IGlobalConfigService;

  @inject(TYPES.IInteractionService)
  private interactionService: IInteractionService;

  @inject(TYPES.ILayerService)
  private layerService: ILayerService;
  private pickingFBO: IFramebuffer;

  private width: number = 0;

  private height: number = 0;

  private alreadyInPicking: boolean = false;

  private pickBufferScale: number = 1.0;

  public init(id: string) {
    const { createTexture2D, createFramebuffer, getContainer } =
      this.rendererService;

    let { width, height } = this.getContainerSize(
      getContainer() as HTMLCanvasElement | HTMLElement,
    );
    width *= DOM.DPR;
    height *= DOM.DPR;
    this.pickBufferScale =
      this.configService.getSceneConfig(id).pickBufferScale || 1;

    width = Math.round(width / this.pickBufferScale);
    height = Math.round(height / this.pickBufferScale);
    // 创建 picking framebuffer，后续实时 resize
    this.pickingFBO = createFramebuffer({
      color: createTexture2D({
        width,
        height,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        usage: TextureUsage.RENDER_TARGET,
      }),
      depth: true,
      width,
      height,
    });

    // 监听 hover 事件
    this.interactionService.on(
      InteractionEvent.Hover,
      this.pickingAllLayer.bind(this),
    );
  }

  public async boxPickLayer(
    layer: ILayer,
    box: [number, number, number, number],
    cb: (...args: any[]) => void,
  ): Promise<any> {
    const { useFramebuffer, clear } = this.rendererService;
    this.resizePickingFBO();
    useFramebuffer(this.pickingFBO, () => {
      clear({
        framebuffer: this.pickingFBO,
        color: [0, 0, 0, 0],
        stencil: 0,
        depth: 1,
      });
      layer.hooks.beforePickingEncode.call();
      layer.renderModels({
        ispick: true,
      });
      layer.hooks.afterPickingEncode.call();
      const features = this.pickBox(layer, box);
      cb(features);
    });
  }

  public pickBox(layer: ILayer, box: [number, number, number, number]): any[] {
    const [xMin, yMin, xMax, yMax] = box.map((v) => {
      const tmpV = v < 0 ? 0 : v;
      return Math.floor((tmpV * DOM.DPR) / this.pickBufferScale);
    });
    const { readPixels, getContainer } = this.rendererService;
    let { width, height } = this.getContainerSize(
      getContainer() as HTMLCanvasElement | HTMLElement,
    );
    width *= DOM.DPR;
    height *= DOM.DPR;
    if (
      xMin > ((width - 1) * DOM.DPR) / this.pickBufferScale ||
      xMax < 0 ||
      yMin > ((height - 1) * DOM.DPR) / this.pickBufferScale ||
      yMax < 0
    ) {
      return [];
    }

    const w = Math.min(width / this.pickBufferScale, xMax) - xMin;
    const h = Math.min(height / this.pickBufferScale, yMax) - yMin;
    const pickedColors: Uint8Array | undefined = readPixels({
      x: xMin,
      // 视口坐标系原点在左上，而 WebGL 在左下，需要翻转 Y 轴
      y: Math.floor(height / this.pickBufferScale - (yMax + 1)),
      width: w,
      height: h,
      data: new Uint8Array(w * h * 4),
      framebuffer: this.pickingFBO,
    });

    const features = [];
    const featuresIdMap: { [key: string]: boolean } = {};
    for (let i = 0; i < pickedColors.length / 4; i = i + 1) {
      const color = pickedColors.slice(i * 4, i * 4 + 4);
      const pickedFeatureIdx = decodePickingColor(color);
      if (pickedFeatureIdx !== -1 && !featuresIdMap[pickedFeatureIdx]) {
        const rawFeature =
          layer.layerPickService.getFeatureById(pickedFeatureIdx);
        features.push({
          // @ts-ignore
          ...rawFeature,
          pickedFeatureIdx,
        });
        featuresIdMap[pickedFeatureIdx] = true;
      }
    }
    return features;
  }

  // 动态设置鼠标光标
  public handleCursor(layer: ILayer, type: string) {
    const { cursor = '', cursorEnabled } = layer.getLayerConfig();
    if (cursorEnabled) {
      const version = this.mapService.version;
      const domContainer =
        version === 'GAODE2.x'
          ? this.mapService.getMapContainer()
          : this.mapService.getMarkerContainer();
      // const domContainer = this.mapService.getMarkerContainer();
      // const domContainer = this.mapService.getMapContainer();
      const defaultCursor = domContainer?.style.getPropertyValue('cursor');
      if (type === 'unmousemove' && defaultCursor !== '') {
        domContainer?.style.setProperty('cursor', '');
      } else if (type === 'mousemove') {
        domContainer?.style.setProperty('cursor', cursor);
      }
    }
    // const domContainer = this.mapService.getMapContainer()
    // domContainer?.style.setProperty('cursor', 'move');
  }

  public destroy() {
    this.pickingFBO.destroy();
    // this.pickingFBO = null; 清除对 webgl 实例的引用
    // @ts-ignore
    this.pickingFBO = null;
  }

  public pickFromPickingFBO = (
    layer: ILayer,
    { x, y, lngLat, type, target }: IInteractionTarget,
  ) => {
    let isPicked = false;
    const { readPixels, getContainer } = this.rendererService;
    let { width, height } = this.getContainerSize(
      getContainer() as HTMLCanvasElement | HTMLElement,
    );
    width *= DOM.DPR;
    height *= DOM.DPR;

    const { enableHighlight, enableSelect } = layer.getLayerConfig();

    const xInDevicePixel = x * DOM.DPR;
    const yInDevicePixel = y * DOM.DPR;
    if (
      xInDevicePixel > width - 1 * DOM.DPR ||
      xInDevicePixel < 0 ||
      yInDevicePixel > height - 1 * DOM.DPR ||
      yInDevicePixel < 0
    ) {
      return false;
    }

    const pickedColors: Uint8Array | undefined = readPixels({
      x: Math.floor(xInDevicePixel / this.pickBufferScale),
      // 视口坐标系原点在左上，而 WebGL 在左下，需要翻转 Y 轴
      y: Math.floor((height - (y + 1) * DOM.DPR) / this.pickBufferScale),
      width: 1,
      height: 1,
      data: new Uint8Array(1 * 1 * 4),
      framebuffer: this.pickingFBO,
    });
    this.pickedColors = pickedColors;

    if (
      pickedColors[0] !== 0 ||
      pickedColors[1] !== 0 ||
      pickedColors[2] !== 0
    ) {
      const pickedFeatureIdx = decodePickingColor(pickedColors);
      // 瓦片数据获取性能问题需要优化
      const rawFeature =
        layer.layerPickService.getFeatureById(pickedFeatureIdx);
      if (
        pickedFeatureIdx !== layer.getCurrentPickId() &&
        type === 'mousemove'
      ) {
        type = 'mouseenter';
      }

      const layerTarget = {
        x,
        y,
        type,
        lngLat,
        featureId: pickedFeatureIdx,
        feature: rawFeature,
        target,
      };
      if (!rawFeature) {
        // this.logger.error(
        //   '未找到颜色编码解码后的原始 feature，请检查 fragment shader 中末尾是否添加了 `gl_FragColor = filterColor(gl_FragColor);`',
        // );
      } else {
        // trigger onHover/Click callback on layer
        isPicked = true;
        layer.setCurrentPickId(pickedFeatureIdx);
        this.triggerHoverOnLayer(layer, layerTarget); // 触发拾取事件
      }
    } else {
      // 未选中
      const layerTarget = {
        x,
        y,
        lngLat,
        type:
          layer.getCurrentPickId() !== null && type === 'mousemove'
            ? 'mouseout'
            : 'un' + type,
        featureId: null,
        target,
        feature: null,
      };
      this.triggerHoverOnLayer(layer, {
        ...layerTarget,
        type: 'unpick',
      });
      this.triggerHoverOnLayer(layer, layerTarget);
      layer.setCurrentPickId(null);
    }

    if (enableHighlight) {
      layer.layerPickService.highlightPickedFeature(pickedColors);
    }
    if (
      enableSelect &&
      type === 'click' &&
      pickedColors?.toString() !== [0, 0, 0, 0].toString()
    ) {
      const selectedId = decodePickingColor(pickedColors);
      if (
        layer.getCurrentSelectedId() === null ||
        selectedId !== layer.getCurrentSelectedId()
      ) {
        layer.layerPickService.selectFeature(pickedColors);
        layer.setCurrentSelectedId(selectedId);
      } else {
        layer.layerPickService.selectFeature(new Uint8Array([0, 0, 0, 0])); // toggle select
        layer.setCurrentSelectedId(null);
      }
    }
    return isPicked;
  };

  // 获取容器的大小 - 兼容小程序环境
  private getContainerSize(container: HTMLCanvasElement | HTMLElement) {
    if ((container as HTMLCanvasElement).getContext) {
      return {
        width: (container as HTMLCanvasElement).width / DOM.DPR,
        height: (container as HTMLCanvasElement).height / DOM.DPR,
      };
    } else {
      return container.getBoundingClientRect();
    }
  }
  private async pickingAllLayer(target: IInteractionTarget) {
    // 判断是否进行拾取操作
    if (!this.layerService.needPick(target.type) || !this.isPickingAllLayer()) {
      return;
    }
    this.alreadyInPicking = true;
    await this.pickingLayers(target);
    this.layerService.renderLayers();
    this.alreadyInPicking = false;
  }

  private isPickingAllLayer() {
    // this.alreadyInPicking 避免多次重复拾取
    if (this.alreadyInPicking) {
      return false;
    }
    // this.layerService.alreadyInRendering 一个渲染序列中只进行一次拾取操作
    if (this.layerService.alreadyInRendering) {
      return false;
    }
    // this.interactionService.dragging amap2 在点击操作的时候同时会触发 dragging 的情况（避免舍去）
    if (this.interactionService.indragging) {
      return false;
    }
    // 判断当前进行 shader pick 拾取判断
    if (!this.layerService.getShaderPickStat()) {
      return false;
    }

    // 进行拾取
    return true;
  }

  private resizePickingFBO() {
    const { getContainer } = this.rendererService;
    let { width, height } = this.getContainerSize(
      getContainer() as HTMLCanvasElement | HTMLElement,
    );
    width *= DOM.DPR;
    height *= DOM.DPR;

    if (this.width !== width || this.height !== height) {
      this.pickingFBO.resize({
        width: Math.round(width / this.pickBufferScale),
        height: Math.round(height / this.pickBufferScale),
      });
      this.width = width;
      this.height = height;
    }
  }
  private async pickingLayers(target: IInteractionTarget) {
    const { clear } = this.rendererService;
    this.resizePickingFBO();
    this.rendererService.useFramebuffer(this.pickingFBO, () => {
      const layers = this.layerService.getRenderList();
      layers
        .filter((layer) => {
          return layer.needPick(target.type);
        })
        .reverse()
        .some((layer) => {
          clear({
            framebuffer: this.pickingFBO,
            color: [0, 0, 0, 0],
            stencil: 0,
            depth: 1,
          });
          layer.layerPickService.pickRender(target);
          const isPicked = this.pickFromPickingFBO(layer, target);
          this.layerService.pickedLayerId = isPicked ? +layer.id : -1;
          return isPicked && !layer.getLayerConfig().enablePropagation;
        });
    });
  }
  public triggerHoverOnLayer(
    layer: ILayer,
    target: {
      x: number;
      y: number;
      type: string;
      lngLat: ILngLat;
      feature: unknown;
      featureId: number | null;
    },
  ) {
    // layer.emit(target.type, target);
    // 判断是否发生事件冲突
    if (isEventCrash(target)) {
      // Tip: 允许用户动态设置鼠标光标
      this.handleCursor(layer, target.type);
      layer.emit(target.type, target);
    }
  }
}
