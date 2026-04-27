enum AppEnvironment {
  dev,
  stage,
  prod;

  bool get isDev => this == AppEnvironment.dev;
  bool get isStage => this == AppEnvironment.stage;
  bool get isProd => this == AppEnvironment.prod;
}
