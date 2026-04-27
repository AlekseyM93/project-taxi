import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../domain/shift_repository.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    required this.shiftRepository,
    required this.locationService,
    required this.authRepository,
  });

  final ShiftRepository shiftRepository;
  final LocationService locationService;
  final AuthRepository authRepository;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  ShiftInfo? _shift;
  DriverOrderCard? _activeOrder;
  bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    await _loadShiftStatus();
    await _checkActiveOrder();
  }

  Future<void> _loadShiftStatus() async {
    try {
      final shift = await widget.shiftRepository.getShiftStatus();
      if (!mounted) return;
      setState(() => _shift = shift);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    }
  }

  Future<void> _checkActiveOrder() async {
    try {
      final order = await widget.shiftRepository.getActiveOrder();
      if (!mounted) return;
      setState(() => _activeOrder = order);
    } catch (_) {}
  }

  Future<void> _toggleShift() async {
    setState(() => _isLoading = true);
    try {
      if (_shift?.isOnline ?? false) {
        await widget.shiftRepository.endShift();
        await widget.locationService.stopTracking();
      } else {
        await widget.shiftRepository.startShift();
        await widget.locationService.startTracking();
      }
      await _loadShiftStatus();
      if (!mounted) return;
      setState(() => _error = null);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _acceptOrder(String orderId) async {
    setState(() => _isLoading = true);
    try {
      await widget.shiftRepository.acceptOrder(orderId);
      await _checkActiveOrder();
      if (!mounted) return;
      setState(() => _error = null);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _startOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.shiftRepository.startOrder(_activeOrder!.id);
      await _checkActiveOrder();
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _finishOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.shiftRepository.finishOrder(_activeOrder!.id);
      setState(() => _activeOrder = null);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cancelOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.shiftRepository.cancelOrder(_activeOrder!.id);
      setState(() => _activeOrder = null);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = _shift?.isOnline ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Водитель'),
        actions: [
          IconButton(icon: const Icon(Icons.attach_money), onPressed: () {}),
          IconButton(icon: const Icon(Icons.person), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: Colors.grey[200],
              child: const Center(child: Text('Карта (подключается в Phase 8)')),
            ),
          ),
          if (_error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: Colors.red[50],
              child: Text(_error!, style: TextStyle(color: Colors.red[800])),
            ),
          if (_activeOrder != null) _buildActiveOrderPanel(),
          _buildShiftPanel(isOnline),
        ],
      ),
    );
  }

  Widget _buildShiftPanel(bool isOnline) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              isOnline ? 'На линии' : 'Не на линии',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isOnline ? Colors.green : Colors.grey,
              ),
            ),
          ),
          Switch(
            value: isOnline,
            onChanged: _isLoading ? null : (_) => _toggleShift(),
            activeColor: Colors.green,
          ),
        ],
      ),
    );
  }

  Widget _buildActiveOrderPanel() {
    final order = _activeOrder!;
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.blue[50],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Заказ #${order.id.substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          if (order.pickupAddress != null) Text('Откуда: ${order.pickupAddress}'),
          if (order.dropoffAddress != null) Text('Куда: ${order.dropoffAddress}'),
          if (order.price != null) Text('${order.price!.toStringAsFixed(0)} ₽', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 8),
          Row(
            children: [
              if (order.status == 'ASSIGNED')
                Expanded(
                  child: FilledButton(
                    onPressed: _isLoading ? null : _startOrder,
                    child: const Text('Начать поездку'),
                  ),
                ),
              if (order.status == 'IN_PROGRESS')
                Expanded(
                  child: FilledButton(
                    onPressed: _isLoading ? null : _finishOrder,
                    child: const Text('Завершить'),
                  ),
                ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _isLoading ? null : _cancelOrder,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                child: const Text('Отмена'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
