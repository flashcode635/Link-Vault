"""
ASGI config for secondbrain project.
Exposes the ASGI callable as a module-level variable named ``application``.
"""

import os
from django.core.asgi import get_asgi_application
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'secondbrain.settings')

application = ASGIStaticFilesHandler(get_asgi_application())
