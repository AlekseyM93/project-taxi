class OfflineCommand {
  const OfflineCommand({
    required this.commandId,
    required this.operationType,
    required this.payload,
    required this.createdAtIso,
    this.deviceId,
    this.retryCount = 0,
  });

  final String commandId;
  final String operationType;
  final Map<String, dynamic> payload;
  final String createdAtIso;
  final String? deviceId;
  final int retryCount;

  Map<String, dynamic> toJson() => {
        'commandId': commandId,
        'operationType': operationType,
        'payload': payload,
        'createdAtIso': createdAtIso,
        if (deviceId != null) 'deviceId': deviceId,
        'retryCount': retryCount,
      };

  factory OfflineCommand.fromJson(Map<String, dynamic> json) {
    return OfflineCommand(
      commandId: json['commandId'] as String,
      operationType: json['operationType'] as String,
      payload: (json['payload'] as Map).cast<String, dynamic>(),
      createdAtIso: json['createdAtIso'] as String,
      deviceId: json['deviceId'] as String?,
      retryCount: json['retryCount'] as int? ?? 0,
    );
  }

  OfflineCommand withRetry() => OfflineCommand(
        commandId: commandId,
        operationType: operationType,
        payload: payload,
        createdAtIso: createdAtIso,
        deviceId: deviceId,
        retryCount: retryCount + 1,
      );
}
