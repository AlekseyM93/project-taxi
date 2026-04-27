import 'dart:async';

import 'package:flutter/material.dart';

class OrderOffer {
  const OrderOffer({
    required this.orderId,
    this.price,
    this.pickupAddress,
    this.dropoffAddress,
    this.distanceKm,
    this.expiresInSeconds = 30,
  });
  final String orderId;
  final double? price;
  final String? pickupAddress;
  final String? dropoffAddress;
  final double? distanceKm;
  final int expiresInSeconds;
}

class OfferCardWidget extends StatefulWidget {
  const OfferCardWidget({
    super.key,
    required this.offer,
    required this.onAccept,
    required this.onDecline,
  });

  final OrderOffer offer;
  final void Function(String orderId) onAccept;
  final void Function(String orderId) onDecline;

  @override
  State<OfferCardWidget> createState() => _OfferCardWidgetState();
}

class _OfferCardWidgetState extends State<OfferCardWidget> {
  late int _remainingSeconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _remainingSeconds = widget.offer.expiresInSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_remainingSeconds > 0) {
        setState(() => _remainingSeconds--);
      } else {
        _timer?.cancel();
        widget.onDecline(widget.offer.orderId);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      elevation: 8,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Text('Новый заказ', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _remainingSeconds > 10 ? Colors.green : Colors.red,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('$_remainingSeconds с', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (widget.offer.pickupAddress != null)
              Text('Откуда: ${widget.offer.pickupAddress}'),
            if (widget.offer.dropoffAddress != null)
              Text('Куда: ${widget.offer.dropoffAddress}'),
            if (widget.offer.distanceKm != null)
              Text('Расстояние: ${widget.offer.distanceKm!.toStringAsFixed(1)} км'),
            if (widget.offer.price != null) ...[
              const SizedBox(height: 8),
              Text(
                '${widget.offer.price!.toStringAsFixed(0)} ₽',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => widget.onDecline(widget.offer.orderId),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                    child: const Text('Отклонить'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => widget.onAccept(widget.offer.orderId),
                    style: FilledButton.styleFrom(backgroundColor: Colors.green),
                    child: const Text('Принять'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: _remainingSeconds / widget.offer.expiresInSeconds,
              backgroundColor: Colors.grey[200],
              valueColor: AlwaysStoppedAnimation(
                _remainingSeconds > 10 ? Colors.green : Colors.red,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
