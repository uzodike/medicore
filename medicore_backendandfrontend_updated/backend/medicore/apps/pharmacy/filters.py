from django_filters import rest_framework as filters
from .models import StockTransaction,Drug
from django.db import models

class DrugFilter(filters.FilterSet):
    stock_status = filters.CharFilter(method='filter_stock_status')

    class Meta:
        model = Drug
        fields = ['category', 'stock_status']   # now valid

    def filter_stock_status(self, queryset, name, value):
        if value == 'out_of_stock':
            return queryset.filter(current_stock__lte=0)
        if value == 'critical':
            return queryset.filter(
                current_stock__gt=0,
                current_stock__lte=models.F('reorder_level') * 0.3
            )
        if value == 'low':
            return queryset.filter(
                current_stock__gt=models.F('reorder_level') * 0.3,
                current_stock__lte=models.F('reorder_level')
            )
        if value == 'good':
            return queryset.filter(current_stock__gt=models.F('reorder_level'))
        return queryset

class StockTransactionFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name='created_at__date', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='created_at__date', lookup_expr='lte')
    transaction_type = filters.CharFilter()
    # The frontend queries by 'movement_type' — alias it to the same DB column
    # so those requests actually filter instead of being silently ignored.
    movement_type = filters.CharFilter(field_name='transaction_type')
    drug_name = filters.CharFilter(field_name='drug__name', lookup_expr='icontains')

    class Meta:
        model = StockTransaction
        fields = ['date_from', 'date_to', 'transaction_type', 'movement_type', 'drug_name']