import { Repository } from 'typeorm';
// import * as typeorm from 'typeorm';
import { AssocManyAttribute } from './AssocManyAttribute';
import { AssocOneAttribute } from './AssocOneAttribute';
import { FactoryAttribute } from './FactoryAttribute';
import { Sequence } from './Sequence';

/**
 * Interface for a class
 */
export interface IConstructable<T> {
  new (): T;
}

export interface IRepositoryManager<T> {
  getRepository: (entity: IConstructable<T>) => Repository<T>;
}

/**
 * Attribute type
 */
export type Attr<U> = [
  keyof U,

  (
    | Sequence<U[keyof U]>
    | AssocManyAttribute<any>
    | AssocOneAttribute<U[keyof U]>
    | FactoryAttribute<any>)
];

export type Attrs<U> = Array<Attr<U>>;

/**
 * Factory defines attributes, sequences and associations for an Entity
 */
export class Factory<T> {
  /**
   * typeorm Entity class
   */
  public Entity: IConstructable<T>;

  /**
   * array of attributes generators
   */
  public attrs: Attrs<T>;

  // private privateRepository: Repository<T> | undefined = undefined;

  /** constructor */
  constructor(
    Entity: IConstructable<T>,
    attrs?: Attrs<T>,
    readonly repositoryManager?: IRepositoryManager<T>
  ) {
    this.Entity = Entity;
    this.attrs = attrs || [];
  }

  private get repository() {
    console.log('repositoryManager ->', this.repositoryManager);
    // this.privateRepository =
    //   this.privateRepository || getRepository(this.Entity);
    // return this.privateRepository;
    return this.repositoryManager!.getRepository(this.Entity);
  }

  /**
   * Clones current factory definition
   */
  public clone(): Factory<T> {
    const clonedAttrs = this.attrs.map<Attr<T>>(([name, attr]) => [
      name,
      attr.clone()
    ]);
    return new Factory<T>(this.Entity, clonedAttrs, this.repositoryManager);
  }

  /**
   * sequence generator
   */
  public sequence<K extends keyof T>(
    name: K,
    sequenceFunction: (i: number) => T[K]
  ): Factory<T> {
    this.attrs.push([name, new Sequence<T[keyof T]>(sequenceFunction)]);
    return this;
  }

  /**
   * attribute generator
   */
  public attr<K extends keyof T>(name: K, value: T[K]): Factory<T> {
    const clonedFactory = this.clone();
    clonedFactory.attrs.push([name, new FactoryAttribute<T[keyof T]>(value)]);
    return clonedFactory;
  }

  // here is `any` for factory attribute definition. Typescript does not understand T[K][0]
  /**
   * association generator for one hasMany
   */
  public assocMany<K extends keyof T>(
    name: K,
    factory: Factory<any>,
    size: number = 1
  ): Factory<T> {
    const clonedFactory = this.clone();
    clonedFactory.attrs.push([name, new AssocManyAttribute(factory, size)]);
    return clonedFactory;
  }

  /**
   * association generator for one hasMany
   */
  public assocOne<K extends keyof T>(
    name: K,
    factory: Factory<T[K]>
  ): Factory<T> {
    const clonedFactory = this.clone();
    clonedFactory.attrs.push([name, new AssocOneAttribute(factory)] as any);
    return clonedFactory;
  }

  /**
   * builds an instance of Entity
   */
  public build(attributes: Partial<T> = {}): T {
    const ignoreKeys = Object.keys(attributes);
    const obj = this.assignAttrs(new this.Entity(), ignoreKeys);
    return this.repository.merge(obj, attributes as any);
  }

  /**
   * builds a list instances of Entity
   */
  public buildList(size: number): T[] {
    return Array.from({ length: size }, () => this.build());
  }

  /**
   * creates an Entity
   */
  public async create(attributes: Partial<T> = {}): Promise<T> {
    const ignoreKeys = Object.keys(attributes);
    const obj = await this.assignAsyncAttrs(new this.Entity(), ignoreKeys);
    const objWithAttrs = this.repository.merge(obj, attributes as any);
    return this.repository.save(objWithAttrs as any);
  }

  /**
   * creates a list of Entities
   */
  public async createList(size: number): Promise<T[]> {
    const objects = Array.from({ length: size }, () => this.create());
    const list = await Promise.all(objects);
    return list;
  }

  private assignAttrs(obj: T, ignoreKeys: string[]): T {
    return this.attrs.reduce((sum, [key, attribute]) => {
      if (ignoreKeys.indexOf(key as string) === -1) {
        sum[key] = attribute.value();
      }
      return sum;
    }, obj);
  }

  private assignAsyncAttrs(obj: T, ignoreKeys: string[]): Promise<T> {
    return this.attrs.reduce((sum, [key, factory]) => {
      return sum.then(async s => {
        if (ignoreKeys.indexOf(key as string) === -1) {
          s[key] = await factory.asyncValue();
        }
        return s;
      });
    }, Promise.resolve(obj));
  }
}
