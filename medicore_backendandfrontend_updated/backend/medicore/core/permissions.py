from rest_framework.permissions import BasePermission

ADMIN = 'admin'


def _is(request, *roles):
    u = request.user
    # admin always passes; otherwise must match one of the listed roles
    return bool(u and u.is_authenticated and (u.role == ADMIN or u.role in roles))


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == ADMIN)


class IsDoctor(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'doctor')


class IsNurse(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'nurse')


class IsReceptionist(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'receptionist')


class IsPharmacist(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'pharmacist')


class IsLabTech(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'lab_tech')


class IsDoctorOrNurse(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'doctor', 'nurse')


class IsAdminOrReceptionist(BasePermission):
    def has_permission(self, request, view):
        return _is(request, 'receptionist')


class IsClinicalStaff(BasePermission):
    """Doctor, nurse, lab tech, or pharmacist (admin always allowed)."""
    def has_permission(self, request, view):
        return _is(request, 'doctor', 'nurse', 'lab_tech', 'pharmacist')