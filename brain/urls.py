"""
URL mappings for brain application (both Web views and REST API endpoints).
"""

from django.urls import path
from brain import views_web, views_api

urlpatterns = [
    # Web views (HTML Templates)
    path('', views_web.dashboard_view, name='dashboard'),
    path('login/', views_web.login_view, name='login'),
    path('register/', views_web.register_view, name='register'),
    path('share/<str:share_hash>/', views_web.shared_brain_view, name='shared_brain'),
    path('api-refrances/', views_web.api_docs_view, name='api_refrances'),
    path('api-refrances', views_web.api_docs_view),
    path('docs/', views_web.api_docs_view, name='api_docs'),
    path('api/docs/', views_web.api_docs_view, name='api_docs_alias'),

    # REST API v1 (PyMongo Async Engine)
    path('api/v1/auth/signup', views_api.api_signup, name='api_signup'),
    path('api/v1/auth/signin', views_api.api_signin, name='api_signin'),
    path('api/v1/auth/me', views_api.api_me, name='api_me'),

    path('api/v1/content', views_api.api_content_list, name='api_content_list'),
    path('api/v1/content/<str:item_id>', views_api.api_content_detail, name='api_content_detail'),

    path('api/v1/folders', views_api.api_folders, name='api_folders'),
    path('api/v1/folders/<str:folder_id>', views_api.api_folder_delete, name='api_folder_delete'),

    path('api/v1/tags', views_api.api_tags, name='api_tags'),

    path('api/v1/brain/share', views_api.api_share_brain, name='api_share_brain'),
    path('api/v1/brain/public/<str:share_hash>', views_api.api_public_share_data, name='api_public_share_data'),

    path('api/v1/health', views_api.api_health, name='api_health'),
]
