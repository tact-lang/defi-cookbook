module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    snapshotSerializers: ["@tact-lang/ton-jest/serializers"],
}
