const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
        "name": "@electron-forge/maker-squirrel",
       "config": {
    "name": "BLAYe",
    "authors": "TheOstrich",
    "exe": "BLAYe.exe",
    "setupExe": "BLAYe-Setup.exe",
    //"setupIcon": "./assets/icon.ico", 
    //"iconUrl": "https://raw.githubusercontent.com/RabbitFored/BLAYe/main/assets/icon.ico", 
   // "loadingGif": "./assets/installing.gif",
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
       },
        "platforms": ["win32"]
      },
      {
    "name": "@electron-forge/maker-wix",
    "config": {
      "name": "BLAYe Professional Billing",
      "manufacturer": "THEOSTRICH",
      "ui": { "chooseDirectory": true }
    },
    "platforms": ["win32"]
  },

      {
        "name": "@electron-forge/maker-zip",
        "platforms": ["darwin", "linux", "win32"]
      }
   // {
   //   name: '@electron-forge/maker-wix', // NEW: This makes the .msi
   //   config: {
   //     ui: {
   //       chooseDirectory: true
   //     },
   //     manufacturer: 'THE OSTRICH inc.' // Add your name here
   //   }
   // },
    //{
    // name: '@electron-forge/maker-zip',
    // platforms: ['darwin'],
   // },
    //{
     // name: '@electron-forge/maker-deb',
     // config: {},
    //},
    //{
    //  name: '@electron-forge/maker-rpm',
     // config: {},
//},
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
