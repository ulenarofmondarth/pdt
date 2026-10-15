# Test Driven Development (TDD) Primer

There are many (many) online resources for learning TDD. This section is a very brief outline.

:::{seealso}
TDD

: Stuff

TST

: Other stuff
:::

```{todo}
Provide TDD references
```

## The TDD Treadmill

:::{sidebar} How do I know my test is right?
"Right" is subjective. A test should confirm one clear function of whatever you intend to create. If you are creating a complex feature try to decompose it into essential components then write simple tests for each.

If you have difficulty identifying suitable test/specifications this `may` indicate incomplete understanding.
:::

(tdd-write-failing-test)=

1. Write a test that fails.

   The idea here is that this test is a 'specification' for the code you are about to write. Basically the test says, 'I will know my code does what I want when this test passes.'

   If the change requires multiple changes, write more than one test but disable all but one. Work on one failing test, then turn on another and repeat [^f1].
   If you are dealing with a bug then write a test that reproduces the bug (i.e. the test that `would have` identified this bug).

```{raw} html
<p style="clear:both"/>
```

:::{sidebar} When do I need more tests?
This is a matter of judgement, but basically if there is more functionality needed for the system to work as a whole, then add refined tests/specifications.
:::

(tdd-write-code)=

2. Write the minimum code that gets this test to pass.

   This may not be the end of the task but if the test passes the specification has been met. Add a more refined test/specification if needed and repeat from step one.

```{raw} html
<p style="clear:both"/>
```

(tdd-refactor)=

3. Refactor to tidy up.

   At this point you have something useful working. You also have one or more passing tests that confirm the code is performing as intended.

   Refactoring is where we review our code and improve it. Perhaps rewriting it to make it clearer, more idiomatic, or efficient. Whatever the case we can be sure we are not 'breaking' the system (assuming our tests really do express our specification) providing our changes do not cause a test to fail.

(tdd-commit-and-push)=

4. Once we have refactored we commit and push our changes.

   This is where we 'show our work' to the core product.

[^f1]: How this is done will be dictated by the test runner you are using.

## Why go to all this trouble?

It may seem like a lot of trouble to create test/specifications, then code to 'fix' them but there is method in this madness.

Firstly, we end up with a fairly comprehensive set of tests for our code. More importantly, these tests give us more confidence when making changes in the future (or indeed during development).

The established test suite acts as a guarantee that any change I make in the future will not inadvertently break my code. If I make a change and one of the existing tests fails then I know that my change has 'broken' the system since these tests specify the correct behaviour for the code (hence a failure tells me, 'this code no longer meets the specification').

Finally, but by no means least, the specification first approach encouraged us to think about how the code we write will be used. It forces us to consider *how* our code will be used. If the interface to our code is poor then it will be difficult to test [^f2].

## Mocks and Spies

It is common to resort to mocking and spying when testing at lower levels. Some advocate *never* using mocks or spies. I think that these tools are useful but a 'code smell'. In other words, there is no point tying yourself in knots trying to avoid using mocks and spies when testing (this can have the opposite effect and drive bad design). Rather you should consider any time you need a mock as a warning that perhaps you need to rethink your design. Think it through, if it still seems that your first thought is fine, go ahead and make that mock in your test.

The closer you get to interfacing with external systems the more likely a mock is the right answer (at least in unit testing).

## What about the overheads?

One objection to this degree of testing is that it means a lot of work maintaining the tests. This objection is born of poor testing architecture.

```{todo}
Some details on separating tests from implementation
```

### It depends on your test type

If a test is specifying a low level function (e.g. how a specific function/method is to work) then your test will inevitably be more tied to the specifics of your code.

For example if I intend my function to return a `Promise` then I really have no choice but to test this specific. For higher level test though I can decouple my tests from their implementation.

Say I specify that my 'library' contains 'books' and that I can get a list of 'book titles' in alphabetic order. This is a high level specification of a feature. My test boils down to:

```text
Given my Library
When I request an alphabetic list of book titles
Then I receive a sorted list of book titles
```

There are myriad ways that I can implement this test. The test itself does not need to be tied to the actual implementation.

```text
createLibrary()
addBookToLibrary('some book')
addBookToLibrary('another book')
addBookToLibrary('book')
addBookToLibrary('xray book')

expect(getAlphabeticListOfBooksInLibrary().asArray).toBe([ 'another book', 'book', 'some book', 'xray book'])
```

The `createLibrary`, `addBookToLibrary`, and `getAlphabeticListOfBooksInLibrary` are all `test` functions, not actual implementation functions.

In another library, that we 'inject' into our tests, we write these `test` adapter functions. It is these that translate the somewhat abstract testing steps into implementation specifics.

```{rubric} Damn that seems redundant
```

In a trivial case, it is. In a real system though it is worthwhile.

Let's say I implement my `library` as a class backed by a `mongodb`. I implement my test proxies with this specific implementation. Then I decide it should be functional and use a relational database. No problem, I implement my adapters (`createLibrary`, `addBookToLibrary`, and `getAlphabeticListOfBooksInLibrary`) with the new implementation and inject this. The `test itself` remains untouched.

The mindset is the same as any implementation; the test is expressed in the problem domain, leave specific implementation to the adapter layer.

```{rubric} Footnotes
```

[^f2]: If you have ever had the misfortune to have to code tests for poorly designed code you will know what a pain it can be. Endless mocking, spies, monkey patching, etc. If you need to invade the code to this extent just to test it then, in the immortal words of the South Park ski instructor, "you're gonna have a bad time".
