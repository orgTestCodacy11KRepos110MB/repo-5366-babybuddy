# -*- coding: utf-8 -*-
"""
Management utility to create users

Example usage:

  manage.py createuser \
          --username test     \
          --email test@test.test \
"""
import sys
import getpass

from django.contrib.auth import get_user_model, models
from django.contrib.auth.password_validation import validate_password
from django.core import exceptions
from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS
from django.utils.functional import cached_property
from django.utils.text import capfirst


class NotRunningInTTYException(Exception):
    pass


class Command(BaseCommand):
    help = "Used to create a user"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.UserModel = get_user_model()
        self.username_field = self.UserModel._meta.get_field(
            self.UserModel.USERNAME_FIELD
        )

    def add_arguments(self, parser):
        parser.add_argument(
            f"--{self.UserModel.USERNAME_FIELD}",
            help="Specifies the login for a user.",
        )
        parser.add_argument(
            "--email",
            dest="email",
            default="",
            help="Specifies the email for the user. Optional.",
        )
        parser.add_argument(
            "--password",
            dest="password",
            help="Specifies the password for the user. Optional.",
        )
        parser.add_argument(
            "--read-only",
            action="store_true",
            default=False,
            help="Specifies read-only privileges for the user. Default is False.",
        )
        parser.add_argument(
            "--is-staff",
            dest="is_staff",
            action="store_true",
            default=False,
            help="Specifies the staff status for the user. Default is False.",
        )

    def handle(self, *args, **options):
        username = options.get(self.UserModel.USERNAME_FIELD)
        password = options.get("password")
        is_group_read_only = options.get("read_only")
        is_staff = options.get("is_staff")

        user_data = {}
        user_password = options.get("password")
        group = ""
        verbose_field_name = self.username_field.verbose_name

        try:
            error_msg = self._validate_username(
                username, verbose_field_name, DEFAULT_DB_ALIAS
            )
            if error_msg:
                raise CommandError(error_msg)

            user_data[self.UserModel.USERNAME_FIELD] = username

            if is_staff and is_group_read_only:
                raise CommandError(
                    "You cannot set both read_only and is_staff flags simultaneously."
                )

            group = self.get_user_group(is_group_read_only)

            # Prompt for a password interactively (if password not set via arg)
            while password is None:
                password = getpass.getpass()
                password2 = getpass.getpass("Password (again): ")

                if password.strip() == "":
                    self.stderr.write("Error: Blank passwords aren't allowed.")
                    password = None
                    # Don't validate blank passwords.
                    continue

                if password != password2:
                    self.stderr.write("Error: Your passwords didn't match.")
                    password = None
                    password2 = None
                    # Don't validate passwords that don't match.
                    continue

                try:
                    validate_password(password2, self.UserModel(**user_data))
                except exceptions.ValidationError as err:
                    self.stderr.write("\n".join(err.messages))
                    response = input(
                        "Bypass password validation and create user anyway? [y/N]: "
                    )
                    if response.lower() != "y":
                        password = None
                        password2 = None
                        continue

                user_password = password

            user = self.UserModel._default_manager.db_manager(
                DEFAULT_DB_ALIAS
            ).create_user(**user_data, password=user_password)
            user.email = options.get("email")
            user.is_staff = options.get("is_staff")
            user.save()
            if user.is_staff:
                user.is_superuser = True
                user.save()
            else:
                user.groups.add(group)

            if options.get("verbosity") > 0:
                self.stdout.write(f"User {username} created successfully.")

        except KeyboardInterrupt:
            self.stderr.write("\nOperation cancelled.")
            sys.exit(1)
        except exceptions.ValidationError as e:
            raise CommandError("; ".join(e.messages))
        except NotRunningInTTYException:
            self.stdout.write(
                "User creation skipped due to not running in a TTY. "
                "You can run `manage.py createuser` in your project "
                "to create one manually."
            )

    @cached_property
    def username_is_unique(self):
        """
        Check if username is unique.
        """
        if self.username_field.unique:
            return True
        return any(
            len(unique_constraint.fields) == 1
            and unique_constraint.fields[0] == self.username_field.name
            for unique_constraint in self.UserModel._meta.total_unique_constraints
        )

    def _validate_username(self, username, verbose_field_name, database):
        """
        Validate username. If invalid, return a string error message.
        """
        if self.username_is_unique:
            try:
                self.UserModel._default_manager.db_manager(database).get_by_natural_key(
                    username
                )
            except self.UserModel.DoesNotExist:
                pass
            else:
                return f"Error: The {verbose_field_name} is already taken."
        if not username:
            return f"{capfirst(verbose_field_name)} cannot be blank."
        try:
            self.username_field.clean(username, None)
        except exceptions.ValidationError as e:
            return "; ".join(e.messages)

    def get_user_group(self, is_group_read_only):
        """
        Returns the group a user belongs to depnding on the '--read-only' flag
        """
        if is_group_read_only:
            return models.Group.objects.get(name="read_only")
        return models.Group.objects.get(name="standard")
