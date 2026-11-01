from celery import shared_task

from plane.utils.office_attendance import expire_attendance


@shared_task
def expire_office_attendance():
    return expire_attendance()
