import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.barberapp.app',
  appName: 'Barber App',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: true,
      iosKeychainPrefix: 'barber-app',
      androidIsEncryption: true,
    },
  },
};

export default config;
