import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e', testMatch:'**/*.spec.mjs',
 timeout:90000, expect:{timeout:10000}, fullyParallel:false, workers:1, retries:0,
 outputDir:process.env.TEST_RESULTS_DIR||'test-results',
 reporter:[['list'],['html',{open:'never'}],['json',{outputFile:process.env.PLAYWRIGHT_JSON_OUTPUT_NAME||'test-results/results.json'}]],
 use:{baseURL:'http://127.0.0.1:8080/looper/',viewport:{width:390,height:844},
  actionTimeout:10000,trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:{args:['--autoplay-policy=no-user-gesture-required']}},
 projects:[
  {name:'chromium',testIgnore:'**/*.soak.spec.mjs',use:{browserName:'chromium'}},
  {name:'chromium-44k',testMatch:'**/effects.spec.mjs',use:{browserName:'chromium',sampleRate:44100}},
  {name:'soak',testMatch:'**/*.soak.spec.mjs',dependencies:['chromium','chromium-44k'],use:{browserName:'chromium',trace:{mode:'retain-on-failure',screenshots:false}}}
 ],
 webServer:{command:'node tests/e2e/server.mjs',url:'http://127.0.0.1:8080/health',reuseExistingServer:false,timeout:15000}
});
