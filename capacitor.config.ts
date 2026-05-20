import type { CapacitorConfig } from '@capacitor/cli';

const config = {
  appId: 'com.archii.app',
  appName: 'Archii',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0e0f11',
    scheme: 'Archii',
  },
  android: {
    backgroundColor: '#0e0f11',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#0e0f11',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#c8a96e',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0e0f11',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'microsoft.com', 'apple.com', 'password'],
    },
  },
};

export default config as CapacitorConfig;
