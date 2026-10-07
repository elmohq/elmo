from __future__ import annotations


class Missing:
    """The type of `MISSING`, for annotating an argument that may hold it."""

    def __bool__(self) -> bool:
        return False

    def __repr__(self) -> str:
        return "MISSING"


MISSING: Missing = Missing()
"""What an argument holds when the caller said nothing about it.

An argument left at this default is not sent. `None` is sent, as JSON `null`,
because clearing a field and leaving it alone are different requests.

Pass it to leave an argument out from code that decides:

    sdk.pets.update(pet_id, name=new_name if renamed else MISSING)

"""
