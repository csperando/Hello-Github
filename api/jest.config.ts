export default {
    preset: "ts-jest",
    testEnvironment: "node",
    testTimeout: 3000,
    clearMocks: true,
    // setupFiles: ["<rootDir>/test/setupEnv.ts"],
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/dist/",
        "<rootDir>/jest.config.ts",
        "<rootDir>/index.ts",
    ],
};
