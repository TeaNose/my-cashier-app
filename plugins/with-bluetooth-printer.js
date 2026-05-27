// plugins/with-bluetooth-printer.js
const { withAndroidManifest, withGradleProperties } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.ACCESS_FINE_LOCATION',
];

function withBluetoothPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of PERMISSIONS) {
      const already = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === name,
      );
      if (!already) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
}

// tp-react-native-bluetooth-printer depends on the legacy
// com.android.support:support-v4:27.0.0, which conflicts with AndroidX
// classes unless Jetifier is enabled. Bake the flag into gradle.properties
// so it survives `expo prebuild --clean`.
function withJetifier(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (p) => p.type === 'property' && p.key === 'android.enableJetifier',
    );
    if (existing) {
      existing.value = 'true';
    } else {
      cfg.modResults.push({
        type: 'property',
        key: 'android.enableJetifier',
        value: 'true',
      });
    }
    return cfg;
  });
}

module.exports = function withBluetoothPrinter(config) {
  config = withBluetoothPermissions(config);
  config = withJetifier(config);
  return config;
};
