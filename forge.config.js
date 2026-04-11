const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "BLAYe",
        authors: "TheOstrich",
        exe: "BLAYe.exe",
        setupExe: "BLAYe-Setup.exe",
        createDesktopShortcut: true,
        createStartMenuShortcut: true
      },
      platforms: ["win32"]
    },
    {
      name: "@electron-forge/maker-wix",
      config: {
        name: "BLAYe Professional Billing",
        manufacturer: "THEOSTRICH",
        ui: { "chooseDirectory": true }
      },
      platforms: ["win32"]
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "linux", "win32"]
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          maintainer: "RabbitFoRed",
          homepage: "https://github.com/RabbitFored/BLAYe"
        }
      }
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {}
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
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
