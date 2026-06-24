const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  const distDir = path.resolve(__dirname, 'dist');

  return {
    mode: isDev ? 'development' : 'production',
    entry: './src-ui/src/main.js',
    output: {
      path: distDir,
      filename: isDev ? 'js/[name].js' : 'js/[name].[contenthash:8].js',
      clean: true,
    },
    resolve: {
      extensions: ['.js', '.vue', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src-ui/src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: 'vue-loader',
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg|ico)$/i,
          type: 'asset/resource',
          generator: { filename: 'img/[name].[hash:8][ext]' },
        },
        {
          test: /\.(woff2?|eot|ttf|otf)$/i,
          type: 'asset/resource',
          generator: { filename: 'fonts/[name].[hash:8][ext]' },
        },
      ],
    },
    plugins: [
      new VueLoaderPlugin(),
      new MiniCssExtractPlugin({
        filename: isDev ? 'css/[name].css' : 'css/[name].[contenthash:8].css',
      }),
      new HtmlWebpackPlugin({
        template: './src-ui/public/index.html',
        inject: true,
        minify: !isDev,
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src-ui/public/lib', to: 'lib', noErrorOnMissing: true },
          { from: 'src-ui/public/icons', to: 'icons', noErrorOnMissing: true },
        ],
      }),
    ],
    devServer: {
      port: 5180,
      hot: true,
      static: { directory: distDir },
      historyApiFallback: true,
    },
    devtool: isDev ? 'eval-cheap-module-source-map' : false,
    performance: { hints: false },
  };
};
