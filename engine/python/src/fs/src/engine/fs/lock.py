import errno, os, sys

if sys.platform == "win32":

    import msvcrt

else:

    import fcntl

class Lock:

    @staticmethod
    def take ( handle: int ) -> None:

        if sys.platform == "win32":

            os.lseek(handle, 0, os.SEEK_SET)

            try: msvcrt.locking(handle, msvcrt.LK_NBLCK, 1)
            except OSError as error:

                if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):

                    raise BlockingIOError(error.errno, error.strerror) from error

                raise

        else:

            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def give ( handle: int ) -> None:

        if sys.platform == "win32":

            os.lseek(handle, 0, os.SEEK_SET)
            msvcrt.locking(handle, msvcrt.LK_UNLCK, 1)

        else:

            fcntl.flock(handle, fcntl.LOCK_UN)
