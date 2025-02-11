Error Handling
==============

In general:

- prefer ``Promise.reject(new Error())`` in ``async`` code, rejecting with an ``Error`` object.
- prefer ``throw`` in synchronous code.

These are, for the most part, functionally equivalent as by default a thrown exception is wrapped automatically into a ``Promise.reject()``. That said, from a code style I think it is clearer to explicitly ``reject`` ``async`` code.

