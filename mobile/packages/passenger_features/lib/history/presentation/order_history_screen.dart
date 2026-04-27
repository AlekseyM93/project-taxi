import 'package:flutter/material.dart';

import '../../home/domain/passenger_order_repository.dart';

class OrderHistoryScreen extends StatefulWidget {
  const OrderHistoryScreen({super.key, required this.orderRepository});

  final PassengerOrderRepository orderRepository;

  @override
  State<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

class _OrderHistoryScreenState extends State<OrderHistoryScreen> {
  List<OrderDetails> _orders = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() => _isLoading = true);
    try {
      final orders = await widget.orderRepository.getOrderHistory(limit: 50);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('История поездок')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _orders.isEmpty
              ? const Center(child: Text('Нет поездок'))
              : RefreshIndicator(
                  onRefresh: _loadHistory,
                  child: ListView.builder(
                    itemCount: _orders.length,
                    itemBuilder: (context, index) {
                      final order = _orders[index];
                      return ListTile(
                        leading: Icon(
                          order.status == 'DONE' ? Icons.check_circle : Icons.cancel,
                          color: order.status == 'DONE' ? Colors.green : Colors.red,
                        ),
                        title: Text('${order.pickupAddress ?? "..."} → ${order.dropoffAddress ?? "..."}'),
                        subtitle: Text(order.createdAt ?? ''),
                        trailing: order.price != null
                            ? Text('${order.price!.toStringAsFixed(0)} ₽', style: const TextStyle(fontWeight: FontWeight.bold))
                            : null,
                      );
                    },
                  ),
                ),
    );
  }
}
