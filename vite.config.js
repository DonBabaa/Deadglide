// How the game is built (`npm run build`).
//
// Two things beyond what Vite does by itself:
//   - the models are packed (tools/pack_models.mjs): what a player downloads of them is well under half of what is in
//     public/models, and unpacks in the browser into exactly the same bytes (the build checks that it does);
//   - the code is cut into what the game needs to start and what it only needs later (the casino, with the library
//     that lets friends play in it; three itself in a piece of its own, which a new build of the game does not change).
import { defineConfig } from 'vite';
import path from 'node:path';
import { packFolder } from './tools/pack_models.mjs';

const packModels = () => ({
  name: 'pack-models',
  apply: 'build',
  closeBundle() {
    console.log('\nPacking the models:');
    packFolder(path.resolve('dist', 'models'));
  },
});

export default defineConfig({
  plugins: [packModels()],
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // (three, but not its unzipper: that is fetched only by a browser that cannot unzip by itself)
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/]libs[\\/])/ }],
        },
      },
    },
  },
});
