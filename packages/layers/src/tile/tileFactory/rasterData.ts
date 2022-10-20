import { ILayer, ISubLayerInitOptions } from '@antv/l7-core';
import { SourceTile } from '@antv/l7-utils';
import { ITileFactoryOptions } from '../interface';
import TileFactory from './base';
import RasterDataLayer from './layers/rasterDataLayer';

export default class RasterTiffTile extends TileFactory {
  public parentLayer: ILayer;

  constructor(option: ITileFactoryOptions) {
    super(option);
    this.parentLayer = option.parent;
  }

  public createTile(tile: SourceTile, initOptions: ISubLayerInitOptions) {
    const {
      colorTexture,
      opacity,
      domain,
      clampHigh,
      clampLow,
      mask,
    } = initOptions;
    const rasterData = tile.data;
    if (!rasterData.data) {
      console.warn('raster data not exist!');
      return {
        layers: [],
      };
    }
    const dataType = this.parentLayer?.getSource()?.parser?.dataType;
    const layer = new RasterDataLayer({
      visible: tile.isVisible,
      mask,
    })
      .source(rasterData.data, {
        parser: {
          // 数据栅格分为单通道栅格和多通道彩色栅格
          type: dataType === 'rgb' ? 'rasterRgb': 'raster',
          width: rasterData.width,
          height: rasterData.height,
          extent: tile.bboxPolygon.bbox,
        },
      })
      .style({
        colorTexture,
        opacity,
        domain,
        clampHigh,
        clampLow,
      });
      this.emitRasterEvent([layer]);
    return {
      layers: [layer],
    };
  }
}
