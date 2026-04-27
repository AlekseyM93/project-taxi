import 'package:flutter/material.dart';

class TripScreen extends StatelessWidget {
  const TripScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Поездка')),
      body: const Center(child: Text('Trip tracking (Phase 6)')),
    );
  }
}
