const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build');

// 1. Patch warnOfExpoGoPushUsage
const warnFile = path.join(baseDir, 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(warnFile)) {
  let content = fs.readFileSync(warnFile, 'utf8');
  if (content.includes("throw new Error(message);")) {
    content = content.replace("throw new Error(message);", "didWarn = true;");
    fs.writeFileSync(warnFile, content, 'utf8');
    console.log('[patch] Patched warnOfExpoGoPushUsage');
  } else if (content.includes("console.warn(message);")) {
    content = content.replace("console.warn(message);", "");
    fs.writeFileSync(warnFile, content, 'utf8');
    console.log('[patch] Silenced warnOfExpoGoPushUsage');
  }
}

// 2. Patch build/index.js warning
const indexFile = path.join(baseDir, 'index.js');
if (fs.existsSync(indexFile)) {
  let content = fs.readFileSync(indexFile, 'utf8');
  if (content.includes("console.warn(message);")) {
    content = content.replace("console.warn(message);", "// console.warn(message);");
    fs.writeFileSync(indexFile, content, 'utf8');
    console.log('[patch] Silenced index.js Expo Go warning');
  }
}

// 3. Patch NotificationsHandler.js deprecation warning
const handlerFile = path.join(baseDir, 'NotificationsHandler.js');
if (fs.existsSync(handlerFile)) {
  let content = fs.readFileSync(handlerFile, 'utf8');
  if (content.includes("console.warn('[expo-notifications]: `shouldShowAlert` is deprecated")) {
    content = content.replace("console.warn('[expo-notifications]: `shouldShowAlert` is deprecated. Specify `shouldShowBanner` and / or `shouldShowList` instead.');", "");
    fs.writeFileSync(handlerFile, content, 'utf8');
    console.log('[patch] Silenced NotificationsHandler.js shouldShowAlert warning');
  }
}

// 4. Patch TopicSubscriptionModule.android.js
const topicFile = path.join(baseDir, 'TopicSubscriptionModule.android.js');
if (fs.existsSync(topicFile)) {
  const replacement = `import { requireOptionalNativeModule } from 'expo-modules-core';
const nativeModule = typeof requireOptionalNativeModule === 'function' ? requireOptionalNativeModule('ExpoTopicSubscriptionModule') : null;
const fallbackModule = {
    addListener: () => { },
    removeListeners: () => { },
    subscribeToTopicAsync: () => Promise.resolve(null),
    unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
export default nativeModule || fallbackModule;
`;
  fs.writeFileSync(topicFile, replacement, 'utf8');
  console.log('[patch] Patched TopicSubscriptionModule.android.js');
}

// 5. Patch PushTokenManager.native.js
const pushManagerFile = path.join(baseDir, 'PushTokenManager.native.js');
if (fs.existsSync(pushManagerFile)) {
  const replacement = `import { requireOptionalNativeModule } from 'expo-modules-core';
import fallback from './PushTokenManager';
const nativeModule = typeof requireOptionalNativeModule === 'function' ? requireOptionalNativeModule('ExpoPushTokenManager') : null;
export default nativeModule || fallback;
`;
  fs.writeFileSync(pushManagerFile, replacement, 'utf8');
  console.log('[patch] Patched PushTokenManager.native.js');
}

// 6. Patch ServerRegistrationModule.native.js
const serverRegFile = path.join(baseDir, 'ServerRegistrationModule.native.js');
if (fs.existsSync(serverRegFile)) {
  const replacement = `import { requireOptionalNativeModule } from 'expo-modules-core';
import fallback from './ServerRegistrationModule';
const nativeModule = typeof requireOptionalNativeModule === 'function' ? requireOptionalNativeModule('NotificationsServerRegistrationModule') : null;
export default nativeModule || fallback;
`;
  fs.writeFileSync(serverRegFile, replacement, 'utf8');
  console.log('[patch] Patched ServerRegistrationModule.native.js');
}
