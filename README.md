# Archii Mobile

App nativa iOS y Android de **Archii** — la plataforma integral de gestion de proyectos de construccion. Construida con [Capacitor](https://capacitorjs.com/) sobre Next.js 16, React 19 y TypeScript.

> Esta app comparte el mismo codigo que la version web/PWA, con adaptaciones nativas para autenticacion, push notifications, camara, y almacenamiento de archivos.

---

## Requisitos

- **Node.js** 20+ y npm
- **Android**: Android Studio Koala (2024.1.1) o superior + SDK 34+
- **iOS**: macOS + Xcode 16+ + CocoaPods (solo en Mac)

---

## Estructura del Proyecto

```
archii_mobile/
├── android/                  # Proyecto Android nativo (Capacitor)
├── ios/                      # Proyecto iOS nativo (Capacitor)
├── src/
│   ├── app/                  # Next.js App Router
│   ├── components/           # Componentes React
│   ├── lib/
│   │   ├── capacitor-native.ts        # Deteccion de plataforma nativa
│   │   ├── capacitor-firebase-auth.ts # Auth nativo (Google, Microsoft, Apple)
│   │   ├── capacitor-notifications.ts # Push notifications nativas
│   │   ├── capacitor-media.ts         # Camara, fotos, archivos, share
│   │   └── capacitor-ui.ts            # StatusBar, Keyboard, Splash, Haptics
│   ├── hooks/
│   │   └── useCapacitor.ts  # Hook unificado para todas las APIs nativas
│   └── ...
├── capacitor.config.ts       # Configuracion de Capacitor
├── next.config.ts            # Next.js (export estatico)
└── package.json
```

---

## Scripts Disponibles

```bash
# Desarrollo web (sin nativo)
npm run dev

# Build completo para mobile
npm run build:mobile

# Sincronizar plataformas nativas
npx cap sync

# Android
npx cap open android          # Abrir Android Studio
npx cap run android           # Ejecutar en dispositivo/emulador

# iOS (requiere macOS)
npx cap open ios              # Abrir Xcode
npx cap run ios               # Ejecutar en dispositivo/simulador
```

---

## Plugins Nativos Instalados

| Plugin | Proposito |
|--------|-----------|
| `@capacitor-firebase/authentication` | Auth nativo con Google, Microsoft, Apple |
| `@capacitor/push-notifications` | Push notifications nativas |
| `@capacitor/camera` | Camara y galeria de fotos |
| `@capacitor/filesystem` | Almacenamiento de archivos nativo |
| `@capacitor/share` | Compartir archivos y contenido |
| `@capacitor/splash-screen` | Pantalla de inicio personalizada |
| `@capacitor/status-bar` | Control de la barra de estado |
| `@capacitor/keyboard` | Control del teclado nativo |
| `@capacitor/haptics` | Feedback tactil (vibraciones) |
| `@capacitor/preferences` | Almacenamiento local (key-value) |

---

## Flujo de Trabajo

### 1. Desarrollo Web

Trabaja normalmente con `npm run dev`. La app detecta automaticamente si esta en nativo o web y usa las APIs correspondientes.

### 2. Build para Mobile

```bash
# Esto compila la app Next.js a estaticos y sincroniza con Android/iOS
npm run build:mobile
```

### 3. Ejecutar en Dispositivo

**Android:**
```bash
npx cap open android
# Luego en Android Studio: Run > Run 'app'
```

**iOS:**
```bash
npx cap open ios
# Luego en Xcode: Product > Run
```

### 4. Iteracion Rapida

Para cambios rapidos sin rebuild completo:
```bash
# Recompilar solo los archivos web y sincronizar
npm run build && npx cap copy
```

---

## Configuracion de Firebase para Mobile

### Android

1. Descarga `google-services.json` desde la consola de Firebase
2. Colocalo en `android/app/google-services.json`
3. Verifica que `capacitor.config.ts` tenga el `appId` correcto

### iOS

1. Descarga `GoogleService-Info.plist` desde la consola de Firebase
2. Colocalo en `ios/App/App/GoogleService-Info.plist`
3. Asegurate de que el `Bundle Identifier` coincida con `com.archii.app`

---

## Autenticacion Nativa

La app usa `@capacitor-firebase/authentication` para manejar el login nativo:

- **Google**: Sign-in nativo con el SDK de Google (no requiere WebView)
- **Microsoft**: OAuth nativo via SafariViewController / Custom Tabs
- **Apple**: Sign in with Apple (solo iOS)
- **Email/Password**: Via Firebase Auth nativo

En web (PWA/navegador), el flujo de auth sigue funcionando con popups como antes.

---

## Push Notifications

El sistema de notificaciones usa el plugin nativo en iOS/Android y cae al Service Worker en web.

Para configurar push nativo:

1. **Android**: Descarga la clave FCM v1 desde Firebase Console > Project Settings > Cloud Messaging
2. **iOS**: Sube tu certificado APNs a Firebase Console y habilita "Push Notifications" en Xcode > Signing & Capabilities

---

## Troubleshooting

### Error: `navigator is not defined` durante build
Asegurate de que todo uso de `navigator` este dentro de checks `typeof window !== 'undefined'` o dentro de `useEffect`.

### Error: `Cannot find module '@/app/api/...'`
Las API routes se excluyen del build estatico porque Capacitor no tiene servidor. El script `build-mobile.sh` las excluye automaticamente.

### Android: `Could not resolve com.google.firebase:firebase-auth`
Verifica que `google-services.json` este en `android/app/` y que el plugin de Firebase Auth este sincronizado: `npx cap sync android`

### iOS: `No such module 'Capacitor'`
Ejecuta `cd ios/App && pod install` desde la terminal.

### Cambios en web no se reflejan en nativo
Ejecuta `npm run build && npx cap copy` para copiar los archivos estaticos actualizados.

---

## Licencia

MIT - Ver [LICENSE](LICENSE) para mas detalles.
