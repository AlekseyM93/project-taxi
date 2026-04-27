import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../domain/passenger_order_repository.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({
    super.key,
    required this.orderRepository,
    required this.locationService,
    required this.authRepository,
  });

  final PassengerOrderRepository orderRepository;
  final LocationService locationService;
  final AuthRepository authRepository;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  LocationData? _currentLocation;
  GeoPoint? _pickup;
  GeoPoint? _dropoff;
  RouteEstimate? _routeEstimate;
  FareEstimate? _fareEstimate;
  OrderDetails? _activeOrder;
  bool _isLoading = false;
  String? _error;
  String _selectingPoint = 'pickup';

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    await _loadCurrentLocation();
    await _checkActiveOrder();
  }

  Future<void> _loadCurrentLocation() async {
    try {
      final location = await widget.locationService.getCurrentLocation();
      if (!mounted) return;
      setState(() {
        _currentLocation = location;
        if (_pickup == null) {
          _pickup = GeoPoint(
            latitude: location.latitude,
            longitude: location.longitude,
          );
        }
      });
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.userFriendlyMessage);
    }
  }

  Future<void> _checkActiveOrder() async {
    try {
      final order = await widget.orderRepository.getActiveOrder();
      if (!mounted) return;
      setState(() => _activeOrder = order);
    } catch (_) {}
  }

  Future<void> _onMapTap(double lat, double lng) async {
    setState(() => _isLoading = true);
    try {
      final address = await widget.orderRepository.reverseGeocode(lat: lat, lng: lng);
      final point = GeoPoint(latitude: lat, longitude: lng, address: address);
      if (!mounted) return;
      setState(() {
        if (_selectingPoint == 'pickup') {
          _pickup = point;
          _selectingPoint = 'dropoff';
        } else {
          _dropoff = point;
        }
        _routeEstimate = null;
        _fareEstimate = null;
      });
      if (_pickup != null && _dropoff != null) {
        await _estimateRoute();
      }
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _estimateRoute() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _isLoading = true);
    try {
      final route = await widget.orderRepository.estimateRoute(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
      );
      final fare = await widget.orderRepository.estimateFare(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
      );
      if (!mounted) return;
      setState(() {
        _routeEstimate = route;
        _fareEstimate = fare;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _createOrder() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _isLoading = true);
    try {
      final order = await widget.orderRepository.createOrder(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
        pickupAddress: _pickup!.address,
        dropoffAddress: _dropoff!.address,
      );
      if (!mounted) return;
      setState(() {
        _activeOrder = order;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cancelOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.orderRepository.cancelOrder(_activeOrder!.id);
      if (!mounted) return;
      setState(() {
        _activeOrder = null;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Заказ такси'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () {},
          ),
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
          if (_activeOrder != null) _buildActiveOrderCard(),
          if (_activeOrder == null) _buildOrderForm(),
        ],
      ),
    );
  }

  Widget _buildOrderForm() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildPointRow('А', _pickup?.address ?? 'Выберите точку подачи', _selectingPoint == 'pickup'),
          const SizedBox(height: 8),
          _buildPointRow('Б', _dropoff?.address ?? 'Выберите точку назначения', _selectingPoint == 'dropoff'),
          if (_routeEstimate != null) ...[
            const SizedBox(height: 8),
            Text(
              '${_routeEstimate!.distanceKm.toStringAsFixed(1)} км · ${_routeEstimate!.estimatedDurationMin.toStringAsFixed(0)} мин',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          if (_fareEstimate != null) ...[
            const SizedBox(height: 4),
            Text(
              '${_fareEstimate!.totalPrice.toStringAsFixed(0)} ₽',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _isLoading || _pickup == null || _dropoff == null ? null : _createOrder,
            child: _isLoading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Заказать'),
          ),
        ],
      ),
    );
  }

  Widget _buildPointRow(String label, String text, bool isActive) {
    return GestureDetector(
      onTap: () => setState(() => _selectingPoint = label == 'А' ? 'pickup' : 'dropoff'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: isActive ? Theme.of(context).colorScheme.primary : Colors.grey[300]!),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: label == 'А' ? Colors.green : Colors.red,
                shape: BoxShape.circle,
              ),
              child: Center(child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold))),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 14), overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveOrderCard() {
    final order = _activeOrder!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text('Заказ #${order.id.substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.bold))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(order.status),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(_statusLabel(order.status), style: const TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ],
          ),
          if (order.driverName != null) ...[
            const SizedBox(height: 8),
            Text('Водитель: ${order.driverName}'),
            if (order.vehicleModel != null) Text('${order.vehicleModel} · ${order.vehiclePlate ?? ""}'),
          ],
          if (order.price != null) ...[
            const SizedBox(height: 4),
            Text('${order.price!.toStringAsFixed(0)} ₽', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
          const SizedBox(height: 12),
          if (order.status == 'NEW' || order.status == 'SEARCHING' || order.status == 'ASSIGNED')
            OutlinedButton(
              onPressed: _isLoading ? null : _cancelOrder,
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Отменить заказ'),
            ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'SEARCHING': return Colors.orange;
      case 'ASSIGNED': return Colors.blue;
      case 'IN_PROGRESS': return Colors.green;
      case 'DONE': return Colors.grey;
      case 'CANCELLED': return Colors.red;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'NEW': return 'Новый';
      case 'SEARCHING': return 'Поиск водителя';
      case 'ASSIGNED': return 'Водитель назначен';
      case 'IN_PROGRESS': return 'В пути';
      case 'DONE': return 'Завершён';
      case 'CANCELLED': return 'Отменён';
      default: return status;
    }
  }
}
