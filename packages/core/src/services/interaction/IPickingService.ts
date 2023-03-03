import { IInteractionTarget } from '../interaction/IInteractionService';
import { ILayer } from '../layer/ILayerService';
import { ILngLat } from '../map/IMapService';
export interface IPickingService {
  pickedColors: Uint8Array | undefined;
  pickedTileLayers: ILayer[];
  init(id: string): void;
  pickFromPickingFBO(layer: ILayer, target: IInteractionTarget): boolean;
  pickBox(layer: ILayer, box: [number, number, number, number]): any[];
  render(layer: ILayer, cb: (...args: any[]) => void): void;
  extractPixels(box: number[]): {
    pickedColors: Uint8Array;
    width: number;
    height: number;
    x: number;
    y: number;
  };
  layer2Pixels(
    layer: ILayer,
    pixelBounds: number[],
    callback: (...args: any[]) => void,
  ): void;
  triggerHoverOnLayer(
    layer: ILayer,
    target: {
      x: number;
      y: number;
      type: string;
      lngLat: ILngLat;
      feature?: unknown;
      featureId?: number | null;
    },
  ): void;

  boxPickLayer(
    layer: ILayer,
    box: [number, number, number, number],
    cb: (...args: any[]) => void,
  ): Promise<any>;
  destroy(): void;
}

export interface ILayerPickService {
  pickData(box: number[]): any;
  pickRasterLayer(
    layer: ILayer,
    target: IInteractionTarget,
    parent?: ILayer,
  ): boolean;
  pick(layer: ILayer, target: IInteractionTarget): boolean;
  /**
   * 绘制拾取图层
   * @param target 触发对象
   */
  pickRender(target: IInteractionTarget): void;
  /**
   * 为图层设置选中对象
   * @param pickedColors
   */
  selectFeature(pickedColors: Uint8Array | undefined): void;
  /**
   * 为图层设置active对象
   * @param pickedColors
   */

  highlightPickedFeature(pickedColors: Uint8Array | undefined): void;

  /**
   * 获取选中的要素
   * @param id q
   */
  getFeatureById(id: number, lngLat?: ILngLat): any;
}
