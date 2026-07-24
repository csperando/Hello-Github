/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    clearMocks: true,
    testPathIgnorePatterns: [
        "/node_modules/",
        "/dist/",
    ],
};
