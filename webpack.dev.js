const path = require('path');
const webpack = require('webpack');

const config = {
  target: 'node',
  entry: './src/extension.ts',
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'eval-source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // Faster compilation for development
              transpileOnly: true,
              experimentalWatchApi: true
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    // Remove HotModuleReplacementPlugin - it's not compatible with VSCode extension host
    
    // Better error reporting
    new webpack.NoEmitOnErrorsPlugin(),
    
    // Define environment variables for hot reload
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
      'process.env.HOT_RELOAD': JSON.stringify(true)
    })
  ],
  // File watching options
  watchOptions: {
    aggregateTimeout: 300,
    poll: 1000,
    ignored: '**/node_modules/**'
  },
  // Development server configuration removed - not needed for VSCode extensions
  // Performance optimizations for development
  optimization: {
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false
  },
  // Better build performance
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename]
    }
  }
};

module.exports = config;