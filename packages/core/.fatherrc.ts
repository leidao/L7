import { string } from "rollup-plugin-string";
export default {
  // more father 4 config:   https://github.com/umijs/father/blob/master/docs/config.md
  esm: {
    output:'es',
  },
  cjs: {
    output:'lib',
  },
  platform:'browser',
  autoprefixer: {
    browsers: ['IE 11', 'last 2 versions'],
  },
  extraBabelPlugins: [
    // 开发模式下以原始文本引入，便于调试
    [
      // import glsl as raw text
      'babel-plugin-inline-import',
      {
        extensions: [
          '.glsl'
        ]
      }
    ],
    [
      'transform-import-css-l7'
    ],
  ],
};
