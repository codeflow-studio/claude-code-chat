const path = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevelopment = !isProduction;

  const config = {
    target: 'node',
    entry: './src/extension.ts',
    mode: isProduction ? 'production' : 'development',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
      clean: isProduction
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
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
                transpileOnly: isDevelopment,
                experimentalWatchApi: isDevelopment
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
      // Define environment variables
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        'process.env.HOT_RELOAD': JSON.stringify(isDevelopment)
      }),
      
      // Better error reporting in development
      ...(isDevelopment ? [new webpack.NoEmitOnErrorsPlugin()] : [])
    ],
    // File watching options for development
    ...(isDevelopment && {
      watchOptions: {
        aggregateTimeout: 300,
        poll: false,
        ignored: '**/node_modules/**'
      }
    }),
    // Performance optimizations
    optimization: {
      ...(isDevelopment && {
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false
      })
    },
    // Caching for better build performance
    cache: isDevelopment ? {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename]
      }
    } : false
  };

  return config;
};