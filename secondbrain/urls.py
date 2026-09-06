"""
URL configuration for secondbrain project.
"""

from django.urls import path, include

urlpatterns = [
    path('', include('brain.urls')),
]

handler404 = 'brain.views_web.custom_404_view'
handler500 = 'brain.views_web.custom_500_view'
