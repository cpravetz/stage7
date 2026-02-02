const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack'); // Import webpack

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'static/js/[name].[contenthash:8].js',
    publicPath: '/',
  },
    mode: 'development', // Ensure development mode for unminified errors
    devtool: 'source-map', // Use 'source-map' for clearer debugging than 'eval-source-map'
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        '@mui/material': path.resolve(__dirname, '../../node_modules/@mui/material'),
        '@mui/system': path.resolve(__dirname, '../../node_modules/@mui/system'),
      },
      fallback: {
        // No need for crypto polyfill anymore
        "buffer": require.resolve("buffer/"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util/"),
        "process": require.resolve("process/browser"),
      }
    },
  	// Configuration for modules and loaders
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react',
                '@babel/preset-typescript'
              ]
            }
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  
    // Configuration for plugins
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        filename: 'index.html',
      }),
      new webpack.DefinePlugin({ // Add DefinePlugin here
        'process.env.NODE_ENV': JSON.stringify('development'), // Explicitly set NODE_ENV for the build
        'process.env.REACT_APP_API_BASE_URL': JSON.stringify(process.env.REACT_APP_API_BASE_URL),
        'process.env.REACT_APP_WS_URL': JSON.stringify(process.env.REACT_APP_WS_URL),
        // Add any other REACT_APP_ variables you need here
      }),
    ],
  };