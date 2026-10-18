const path = require('path');

// Load `expo-modules-core` the way `expo` resolves it, wherever npm placed it.
const expoDir = path.dirname(require.resolve('expo/package.json'));
const ExpoModulesCore = require(require.resolve('expo-modules-core', { paths: [expoDir] }));

test("jest-expo's expo-modules-core mock applies to the copy expo uses", () => {
    // jest-expo's mock makes createSnapshotFriendlyRef() serialize as '[React.ref]'.
    expect(JSON.stringify(ExpoModulesCore.createSnapshotFriendlyRef())).toBe('"[React.ref]"');
});